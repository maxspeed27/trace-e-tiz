from pathlib import Path
from fastapi import (
    FastAPI, 
    UploadFile, 
    File, 
    Form, 
    HTTPException, 
    Response, 
    APIRouter,
    BackgroundTasks
)
from starlette.responses import FileResponse
from typing import List, Optional
from pydantic import BaseModel
from app.document_processing.processor import DocumentProcessor, DocumentMetadata
from app.document_processing.indexer import DocumentIndexer
from app.retrieval.query_engine import QueryEngine
from qdrant_client.http import models
from qdrant_client import QdrantClient
from fastapi.middleware.cors import CORSMiddleware
import tempfile
import os
import uuid
import logging
from dotenv import load_dotenv
import fitz
from fastapi.responses import StreamingResponse
import io
import mimetypes
from app.models.document import DocumentMetadata, HierarchyContext
mimetypes.init()

load_dotenv()  # Add this before initializing any clients

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(root_path="/api")
app.qdrant_client = QdrantClient("http://localhost:6333")
processor = DocumentProcessor()
indexer = DocumentIndexer()
logger = logging.getLogger(__name__)
query_engine = QueryEngine()  # Single source of truth

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str
    contract_set_id: Optional[str] = None
    document_ids: Optional[List[str]] = None
    top_k: Optional[int] = 5

class Citation(BaseModel):
    document_id: str
    page_number: Optional[int]
    section_reference: Optional[str] = None
    text_snippet: str

class QueryResponse(BaseModel):
    answer: str
    citations: List[Citation]
    confidence: float

class DocumentResponse(BaseModel):
    id: str
    name: str
    url: str

class ContractSetResponse(BaseModel):
    id: str
    name: str
    documents: List[DocumentResponse]

# Create a dedicated router for document handling
document_router = APIRouter()

@document_router.get("/{document_id}/content")
async def get_document(document_id: str):
    file_path = os.path.join(UPLOAD_DIR, f"{document_id}.pdf")
    print(f"Looking for file at: {file_path}")  # Debug log
    print(f"File exists: {os.path.exists(file_path)}")  # Debug log
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Document not found: {document_id}")
    
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=f"{document_id}.pdf",
        headers={
            "Content-Type": "application/pdf",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        }
    )

# Mount the router at a specific path
app.include_router(document_router, prefix="/documents")

@app.post("/ingest")
async def ingest_document(
    file: UploadFile = File(...),
    contract_set_id: str = Form(...),
    document_id: str = Form(...),
    document_type: str = Form(...),
    level: int = Form(...),
    effective_date: str = Form(None),
    parent_document_id: str = Form(None)
):
    logger.debug("=== Starting Document Ingestion ===")
    # Save uploaded file temporarily
    temp_dir = tempfile.mkdtemp()
    temp_path = Path(temp_dir) / file.filename
    logger.debug(f"Saving file to temp directory: {temp_dir}")
    
    try:
        with temp_path.open("wb") as f:
            content = await file.read()
            f.write(content)
        logger.debug(f"File saved successfully: {temp_path}")
        
        # Process document
        logger.debug("Creating metadata...")
        metadata = DocumentMetadata(
            contract_set_id=contract_set_id,
            document_id=document_id,
            document_type=document_type,
            name=file.filename,
            level=level,
            effective_date=effective_date,
            parent_document_id=parent_document_id,
            hierarchy_context=HierarchyContext(
                total_docs_in_set=1,
                doc_position=1,
                has_children=False
            ),
            pdf_metadata={}
        )
        
        logger.debug("Starting document processing...")
        nodes = await processor.process_document(str(temp_path), metadata)
        logger.debug(f"Document processing complete. Generated {len(nodes)} nodes")
        
        logger.debug("Starting node indexing...")
        indexer.index_nodes(nodes)
        logger.debug("Node indexing complete")
        
        return {"status": "success", "chunks_processed": len(nodes)}
        
    except Exception as e:
        logger.error(f"Error during ingestion: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        logger.debug(f"Cleaning up temp directory: {temp_dir}")
        try:
            temp_path.unlink(missing_ok=True)
            Path(temp_dir).rmdir()
            logger.debug("Cleanup complete")
        except Exception as e:
            logger.error(f"Error during cleanup: {str(e)}")

@app.post("/query", response_model=QueryResponse)
async def query_documents(request: QueryRequest):
    # Pass empty list if None to avoid issues with null document_ids
    response = await query_engine.query(
        query=request.query,
        document_ids=request.document_ids or [],  # Pass empty list if None
        top_k=request.top_k
    )
    
    return response 

@app.get("/contract-sets")
async def get_contract_sets():
    try:
        # Query Qdrant for all unique contract sets
        response = app.qdrant_client.scroll(
            collection_name="documents",
            scroll_filter=None,
            limit=100,
            with_payload=True
        )
        
        # Group by contract_set_id
        contract_sets = {}
        for point in response[0]:
            if not point.payload:
                continue
                
            set_id = point.payload.get('metadata', {}).get('contract_set_id')
            doc_id = point.payload.get('metadata', {}).get('document_id')
            doc_name = point.payload.get('metadata', {}).get('name', 'Unnamed Document')
            
            if set_id not in contract_sets:
                contract_sets[set_id] = {
                    "id": set_id,
                    "name": f"Contract Set {set_id[:8]}",  # You might want to store/retrieve actual names
                    "documents": []
                }
            
            # Add document if not already added
            if not any(d['id'] == doc_id for d in contract_sets[set_id]['documents']):
                contract_sets[set_id]['documents'].append({
                    "id": doc_id,
                    "name": doc_name,
                    "url": f"/api/documents/{doc_id}"
                })
        
        return list(contract_sets.values())
        
    except Exception as e:
        logger.error(f"Error fetching contract sets: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/documents/{contract_set_id}")
async def get_documents(contract_set_id: str):
    # Implement fetching documents for a specific contract set
    pass 

@app.on_event("startup")
async def startup_event():
    try:
        app.qdrant_client.get_collection("contracts")
    except:
        app.qdrant_client.create_collection(
            collection_name="contracts",
            vectors_config=models.VectorParams(
                size=1024,  # Changed from 1536 to 1024 for Cohere's dimensions
                distance=models.Distance.COSINE
            ),
            on_disk_payload=True,
            optimizers_config=models.OptimizersConfigDiff(
                indexing_threshold=0,
            ),
        )
        app.qdrant_client.create_payload_index(
            collection_name="contracts",
            field_name="contract_set_id",
            field_schema=models.PayloadSchemaType.KEYWORD,
        )
        app.qdrant_client.create_payload_index(
            collection_name="contracts", 
            field_name="document_id",
            field_schema=models.PayloadSchemaType.KEYWORD,
        )
        app.qdrant_client.create_payload_index(
            collection_name="documents", 
            field_name="metadata.document_id",
            field_schema=models.PayloadSchemaType.KEYWORD,
        )

@app.post("/upload")
async def upload_files(
    files: List[UploadFile] = File(...),
    set_name: str = Form(...),
    effective_date: Optional[str] = Form(None),
    parent_document_id: Optional[str] = Form(None),
    background_tasks: BackgroundTasks = None
):
    try:
        if not files:
            raise HTTPException(status_code=400, detail="No files provided")
            
        # Validate file types and sizes upfront
        for file in files:
            if not file.filename.lower().endswith(('.pdf', '.docx')):
                raise HTTPException(
                    status_code=422, 
                    detail=f"Unsupported file type: {file.filename}. Only PDF and DOCX files are supported."
                )
                
            # Read a small chunk to verify file is not empty/corrupted
            first_chunk = await file.read(1024)
            if not first_chunk:
                raise HTTPException(
                    status_code=422,
                    detail=f"File is empty or corrupted: {file.filename}"
                )
            await file.seek(0)  # Reset file pointer

        logger.debug(f"Starting upload for set: {set_name} with {len(files)} files")
        contract_set_id = str(uuid.uuid4())
        documents = []
        
        with tempfile.TemporaryDirectory() as temp_dir:
            for file in files:
                # Skip system files and non-PDF files
                if file.filename.startswith('.') or not file.filename.lower().endswith('.pdf'):
                    logger.debug(f"Skipping non-PDF or system file: {file.filename}")
                    continue
                    
                try:
                    logger.debug(f"Processing file: {file.filename}")
                    document_id = str(uuid.uuid4())
                    
                    # Create nested directory structure if needed
                    temp_path = os.path.join(temp_dir, file.filename)
                    os.makedirs(os.path.dirname(temp_path), exist_ok=True)
                    
                    # Save file
                    logger.debug(f"Saving file to temp path: {temp_path}")
                    content = await file.read()
                    with open(temp_path, "wb") as f:
                        f.write(content)
                    
                    # Verify PDF is valid
                    try:
                        with fitz.open(temp_path) as test_doc:
                            num_pages = len(test_doc)
                            logger.debug(f"PDF verification: {file.filename} has {num_pages} pages")
                            # Test we can read text from first page
                            first_page_text = test_doc[0].get_text()
                            if not first_page_text:
                                logger.warning(f"Warning: First page of {file.filename} has no text")
                    except Exception as pdf_error:
                        logger.error(f"Invalid PDF file {file.filename}: {str(pdf_error)}")
                        raise HTTPException(status_code=400, detail=f"Invalid PDF file: {file.filename}")
                    
                    # Process document
                    logger.debug("Creating metadata")
                    metadata = DocumentMetadata(
                        document_id=document_id,
                        contract_set_id=contract_set_id,
                        name=file.filename,
                        document_type="unknown",  # Will be detected during processing
                        level=1,  # Default to level 1, will be adjusted during processing
                        effective_date=effective_date,
                        parent_document_id=parent_document_id,
                        hierarchy_context=HierarchyContext(
                            total_docs_in_set=1,
                            doc_position=1,
                            has_children=False
                        ),
                        pdf_metadata={}
                    )
                    
                    # Process and index
                    logger.debug("Processing document")
                    section_chunks, detail_chunks = await processor.process_document_late_chunking(temp_path, metadata)
                    chunks = section_chunks + detail_chunks  # Combine both types of chunks for indexing
                    
                    logger.debug(f"Got {len(chunks)} chunks")
                    
                    logger.debug("Indexing chunks")
                    await indexer.index_nodes(chunks)
                    
                    # Create permanent directory structure if needed
                    permanent_path = os.path.join(UPLOAD_DIR, f"{document_id}.pdf")
                    os.makedirs(os.path.dirname(permanent_path), exist_ok=True)
                    
                    # Save permanently
                    logger.debug("Saving file permanently")
                    os.rename(temp_path, permanent_path)
                    
                    # Add these debug lines
                    logger.info(f"File saved to: {permanent_path}")
                    logger.info(f"File exists: {os.path.exists(permanent_path)}")
                    logger.info(f"File size: {os.path.getsize(permanent_path)}")
                    logger.info(f"Directory contents: {os.listdir(UPLOAD_DIR)}")
                    
                    # Verify permanent file
                    if not os.path.exists(permanent_path):
                        raise HTTPException(status_code=500, detail=f"Failed to save file permanently: {file.filename}")
                    
                    try:
                        with fitz.open(permanent_path) as verify_doc:
                            verify_pages = len(verify_doc)
                            logger.debug(f"Permanent file verification: {file.filename} has {verify_pages} pages")
                    except Exception as verify_error:
                        logger.error(f"Failed to verify permanent file {file.filename}: {str(verify_error)}")
                        raise HTTPException(status_code=500, detail=f"Failed to verify saved file: {file.filename}")
                    
                    documents.append({
                        "id": document_id,
                        "name": file.filename,
                        "url": f"/api/documents/{document_id}"
                    })
                    logger.debug(f"Successfully processed {file.filename}")
                except Exception as file_error:
                    logger.error(f"Error processing file {file.filename}: {str(file_error)}", exc_info=True)
                    raise HTTPException(status_code=500, detail=f"Error processing file {file.filename}: {str(file_error)}")
        
        if not documents:
            raise HTTPException(status_code=400, detail="No valid PDF files were found in the upload")
            
        logger.debug("Upload completed successfully")
        return {
            "id": contract_set_id,
            "name": set_name,
            "documents": documents
        }
    except Exception as e:
        logger.error(f"Upload error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.options("/documents/{document_id}")
async def document_options(document_id: str):
    return Response(
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Max-Age": "3600",
        }
    ) 

@app.get("/documents")
async def get_documents():
    try:
        files = [f for f in os.listdir(UPLOAD_DIR) if f.endswith('.pdf')]
        documents = []
        for file in files:
            document_id = file.replace('.pdf', '')
            documents.append({
                "id": document_id,
                "name": os.path.basename(file),  # Get just the filename
                "originalName": file.replace('.pdf', '')  # Store original name without extension
            })
        return documents
    except Exception as e:
        logger.error(f"Error getting documents: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 

# Export for other modules to use
__all__ = ['app', 'query_engine'] 