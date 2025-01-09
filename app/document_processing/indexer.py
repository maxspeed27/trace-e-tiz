from typing import List, Optional
from .processor import DocumentProcessor
from ..models.document import DocumentMetadata, TextChunk, HierarchyContext
import logging
import os
from pathlib import Path
from qdrant_client import QdrantClient
from qdrant_client.http import models
from qdrant_client.http.models import Filter, FieldCondition, MatchValue, PointStruct
import cohere
import uuid
import fitz

logger = logging.getLogger(__name__)

class DocumentIndexer:
    def __init__(self):
        self.processor = DocumentProcessor()
        self.upload_dir = Path(os.getenv('UPLOAD_DIR', 'uploads'))
        self.upload_dir.mkdir(exist_ok=True)
        self.qdrant_client = QdrantClient("http://localhost:6333")
        self.cohere_client = cohere.Client(os.getenv("COHERE_API_KEY"))
        
        # Fix: Create collection more robustly
        try:
            # First try to get collection
            self.qdrant_client.get_collection("documents")
            logger.info("Found existing 'documents' collection")
        except Exception as e:
            logger.info(f"Collection not found: {str(e)}")
            # Create collection with explicit error handling
            try:
                self.qdrant_client.create_collection(
                    collection_name="documents",
                    vectors_config=models.VectorParams(
                        size=1024,
                        distance=models.Distance.COSINE
                    )
                )
                logger.info("Created new 'documents' collection")
            except Exception as create_error:
                logger.error(f"Failed to create collection: {str(create_error)}")
                raise RuntimeError(f"Could not initialize Qdrant collection: {str(create_error)}")

    async def index_document(
        self,
        file_path: str,
        contract_set_id: str,
        document_name: str,
        metadata: Optional[dict] = None
    ) -> str:
        """Index a document with metadata"""
        document_id = str(Path(file_path).stem)
        
        # Delete existing document chunks first
        try:
            await self.delete_document(document_id, contract_set_id)
        except Exception as e:
            logger.warning(f"Error deleting existing document: {str(e)}")

        # Extract text and metadata from PDF
        try:
            doc = fitz.open(file_path)
            first_page_text = doc[0].get_text().lower() if len(doc) > 0 else ""
            
            # Extract PDF metadata
            pdf_info = doc.metadata
            doc_type = "other"
            level = 4
            
            # Smart document type detection using filename, content and metadata
            doc_name_lower = document_name.lower()
            
            # Check title in PDF metadata
            pdf_title = pdf_info.get("title", "").lower() if pdf_info else ""
            
            # Combined text for checking (filename + PDF title + first page)
            search_text = f"{doc_name_lower} {pdf_title} {first_page_text}"
            
            # Detect document type with improved logic
            if any(term in search_text for term in ["addendum", "amendment", "modification", "supplement"]):
                if any(term in search_text for term in ["master", "msa"]):
                    # Check if it's an amendment TO a master agreement
                    if any(f"{mod} to master" in search_text 
                          for mod in ["addendum", "amendment", "modification", "supplement"]):
                        doc_type = "amendment"
                        level = 2
                    else:
                        doc_type = "master" 
                        level = 1
                else:
                    doc_type = "amendment"
                    level = 2
            elif any(term in search_text for term in ["master", "msa", "agreement"]):
                doc_type = "master"
                level = 1
            elif "sow" in search_text or "statement of work" in search_text:
                doc_type = "sow" 
                level = 3
            elif "change order" in search_text:
                doc_type = "change_order"
                level = 4
            
            # Create metadata with hierarchy info and PDF metadata
            doc_metadata = DocumentMetadata(
                document_id=document_id,
                contract_set_id=contract_set_id,
                name=document_name,
                document_type=doc_type,
                level=level,
                hierarchy_context=HierarchyContext(
                    total_docs_in_set=1,
                    doc_position=1,
                    has_children=False
                ),
                pdf_metadata=pdf_info if pdf_info else {}
            )

            doc.close()

            chunks = await self.processor.process_document(file_path, doc_metadata)
            if chunks:
                await self.index_nodes(chunks)
            return doc_metadata.document_id
            
        except Exception as e:
            logger.error(f"Error indexing document {file_path}: {str(e)}", exc_info=True)
            raise

    async def index_contract_set(
        self,
        files: List[tuple[str, str]],  # List of (file_path, document_name) tuples
        contract_set_id: str
    ) -> List[str]:
        """Index multiple related documents as a contract set"""
        document_ids = []
        total_docs = len(files)
        
        # First pass: Process master agreements
        doc_position = 1
        for file_path, doc_name in files:
            if any(key in doc_name.lower() for key in ["master", "msa", "agreement"]):
                doc_id = await self.index_document(
                    file_path=file_path,
                    contract_set_id=contract_set_id,
                    document_name=doc_name,
                    metadata={
                        "hierarchy_context": HierarchyContext(
                            total_docs_in_set=total_docs,
                            doc_position=doc_position,
                            has_children=True
                        ).dict()
                    }
                )
                document_ids.append(doc_id)
                doc_position += 1
        
        # Second pass: Process remaining documents
        for file_path, doc_name in files:
            if not any(key in doc_name.lower() for key in ["master", "msa", "agreement"]):
                doc_id = await self.index_document(
                    file_path=file_path,
                    contract_set_id=contract_set_id,
                    document_name=doc_name,
                    metadata={
                        "hierarchy_context": HierarchyContext(
                            total_docs_in_set=total_docs,
                            doc_position=doc_position,
                            has_children=False
                        ).dict()
                    }
                )
                document_ids.append(doc_id)
                doc_position += 1
            
        return document_ids 

    async def index_nodes(self, chunks: List[TextChunk]):
        """Index text chunks into Qdrant"""
        try:
            # Get embeddings for all chunks
            texts = [chunk.text for chunk in chunks]
            embeddings = await self._get_embeddings(texts)
            
            # Prepare points for Qdrant
            points = []
            for i, chunk in enumerate(chunks):
                point = models.PointStruct(
                    id=str(uuid.uuid4()),
                    vector=embeddings[i],
                    payload={
                        "text": chunk.text,
                        "document_id": chunk.metadata.document_id,
                        "contract_set_id": chunk.metadata.contract_set_id,
                        "page_number": chunk.page_number,
                        "section_reference": chunk.section_reference,
                        "chunk_id": chunk.chunk_id,
                        "section_id": chunk.section_id,
                        "level_in_document": chunk.level_in_document,
                        "parent_id": chunk.parent_id,
                        "document_type": chunk.metadata.document_type,
                        "level": chunk.metadata.level,
                        "hierarchy_context": {
                            "total_docs_in_set": chunk.metadata.hierarchy_context.total_docs_in_set,
                            "doc_position": chunk.metadata.hierarchy_context.doc_position,
                            "has_children": chunk.metadata.hierarchy_context.has_children
                        } if chunk.metadata.hierarchy_context else None,
                        "name": chunk.metadata.name,
                        "version": "1"  # Always set to "1"
                    }
                )
                points.append(point)
            
            # Upsert points to Qdrant
            self.qdrant_client.upsert(
                collection_name="documents",
                points=points
            )
            
            logger.debug(f"Indexed {len(chunks)} chunks successfully")
            
        except Exception as e:
            logger.error(f"Error indexing chunks: {str(e)}", exc_info=True)
            raise

    async def _get_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Get embeddings for a list of texts using Cohere"""
        try:
            response = self.cohere_client.embed(
                texts=texts,
                model="embed-english-v3.0",
                input_type="search_document"
            )
            return response.embeddings
        except Exception as e:
            logger.error(f"Error getting embeddings: {str(e)}")
            raise 

    async def delete_document(self, document_id: str, contract_set_id: str):
        """Delete all chunks for a specific document"""
        try:
            self.qdrant_client.delete(
                collection_name="documents",
                points_selector=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="document_id",
                            match=models.MatchValue(value=document_id)
                        ),
                        models.FieldCondition(
                            key="contract_set_id",
                            match=models.MatchValue(value=contract_set_id)
                        )
                    ]
                )
            )
            logger.info(f"Deleted existing document: {document_id}")
        except Exception as e:
            logger.error(f"Error deleting document: {str(e)}")
            raise 