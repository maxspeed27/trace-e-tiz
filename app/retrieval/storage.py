from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient, models
import logging
import cohere
import os
from ..models.document import TextChunk

logger = logging.getLogger(__name__)

class VectorStorage:
    def __init__(self):
        self.collection_name = "documents"
        self.cohere_client = cohere.Client(os.getenv("COHERE_API_KEY"))
        
        # Initialize Qdrant client with retry logic
        self.qdrant_client = QdrantClient(
            host="localhost",
            port=6333,
            timeout=60  # Increase timeout for large operations
        )
        
        # Ensure collection exists
        self._ensure_collection()

    def _ensure_collection(self):
        """Ensure the collection exists with proper configuration"""
        try:
            collections = self.qdrant_client.get_collections().collections
            exists = any(c.name == self.collection_name for c in collections)
            
            if not exists:
                self.qdrant_client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=models.VectorParams(
                        size=1024,  # Cohere embed v3 dimension
                        distance=models.Distance.COSINE
                    )
                )
                
                # Create necessary payload indexes for efficient filtering
                self.qdrant_client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="document_id",
                    field_schema=models.PayloadSchemaType.KEYWORD
                )
                self.qdrant_client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="contract_set_id",
                    field_schema=models.PayloadSchemaType.KEYWORD
                )
                
        except Exception as e:
            logger.error(f"Failed to ensure collection: {str(e)}")
            raise

    async def store_chunks(self, chunks: List[TextChunk]) -> None:
        """Store multiple chunks with their embeddings"""
        try:
            # Batch texts for embedding
            texts = [chunk.text for chunk in chunks]
            embeddings = self.cohere_client.embed(
                texts=texts,
                model="embed-multilingual-v3.0",
                input_type="search_document"
            ).embeddings

            # Prepare points for Qdrant
            points = []
            for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                metadata = chunk.metadata.dict() if hasattr(chunk.metadata, 'dict') else chunk.metadata
                points.append(models.PointStruct(
                    id=idx,
                    vector=embedding,
                    payload={
                        "text": chunk.text,
                        "document_id": chunk.metadata.document_id,
                        "contract_set_id": chunk.metadata.contract_set_id,
                        "page_number": chunk.page_number,
                        "chunk_id": chunk.chunk_id,
                        "parent_id": chunk.parent_id,
                        "level_in_document": chunk.level_in_document,
                        "section_id": chunk.section_id,
                        "section_reference": chunk.section_reference,
                        "metadata": metadata
                    }
                ))

            # Batch upload to Qdrant
            self.qdrant_client.upsert(
                collection_name=self.collection_name,
                points=points,
                wait=True
            )
            
            logger.info(f"Successfully stored {len(chunks)} chunks")
            
        except Exception as e:
            logger.error(f"Failed to store chunks: {str(e)}")
            raise

    async def search_by_metadata(self, metadata_filter: Dict[str, Any], limit: int = 10) -> List[Dict[str, Any]]:
        """Search for chunks by metadata"""
        try:
            # Convert metadata filter to Qdrant filter conditions
            filter_conditions = []
            for key, value in metadata_filter.items():
                if value is not None:
                    if isinstance(value, list):
                        filter_conditions.append(
                            models.FieldCondition(
                                key=key,
                                match=models.MatchAny(any=value)
                            )
                        )
                    else:
                        filter_conditions.append(
                            models.FieldCondition(
                                key=key,
                                match=models.MatchValue(value=value)
                            )
                        )

            # Execute search
            results = self.qdrant_client.scroll(
                collection_name=self.collection_name,
                scroll_filter=models.Filter(
                    must=filter_conditions
                ) if filter_conditions else None,
                limit=limit,
                with_payload=True,
                with_vectors=False
            )[0]  # scroll returns (points, next_page_offset)

            return [point.payload for point in results]

        except Exception as e:
            logger.error(f"Failed to search by metadata: {str(e)}")
            raise

    async def search(self, query: str, filter_conditions: Dict = None, limit: int = 5) -> List[Any]:
        try:
            # Convert query to embedding
            query_embedding = await self._get_embedding(query)
            
            # Prepare search conditions
            search_params = models.SearchParams(
                hnsw_ef=128,
                exact=False
            )
            
            # Convert filter conditions to Qdrant format if provided
            qdrant_filter = None
            if filter_conditions:
                qdrant_filter = models.Filter(
                    must=[
                        models.FieldCondition(
                            key=key,
                            match=value if not isinstance(value, dict) else models.MatchAny(**value)
                        ) for key, value in filter_conditions.items()
                    ]
                )
            
            # Perform search
            results = self.qdrant_client.search(
                collection_name="documents",
                query_vector=query_embedding,
                limit=limit,
                query_filter=qdrant_filter,
                search_params=search_params
            )
            
            return results
        except Exception as e:
            logger.error(f"Error in search: {str(e)}")
            raise 