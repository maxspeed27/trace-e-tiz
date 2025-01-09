from fastapi import FastAPI, UploadFile, File, BackgroundTasks, APIRouter, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import List, Dict
import uuid
import os
from app.document_processing.processor import DocumentProcessor, DocumentMetadata
from app.retrieval.storage import VectorStorage
from qdrant_client.http import models
from fastapi.responses import FileResponse
from pathlib import Path
from fastapi import HTTPException
from fastapi import Response
from app.models.document import DocumentMetadata, HierarchyContext
from app.document_processing.indexer import DocumentIndexer
import logging
import sys

# Clear any existing handlers
root = logging.getLogger()
if root.handlers:
    for handler in root.handlers:
        root.removeHandler(handler)

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ],
    force=True
)

# Set debug level for our processor module
logging.getLogger('app.document_processing.processor').setLevel(logging.DEBUG)

logger = logging.getLogger(__name__)

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create separate routers
document_router = APIRouter()
upload_router = APIRouter()
contract_sets_router = APIRouter()

# Define the upload directory as a constant
UPLOAD_DIR = Path(os.getenv('UPLOAD_DIR', 'uploads'))

@document_router.get("/{document_id}/content")
async def get_document(document_id: str):
    # Convert to absolute path and resolve any symlinks
    document_path = Path(UPLOAD_DIR).resolve() / f"{document_id}.pdf"
    
    print(f"Looking for file at: {document_path}")  # Debug log
    print(f"File exists: {document_path.exists()}")  # Debug log
    
    if not document_path.exists():
        raise HTTPException(
            status_code=404, 
            detail=f"Document not found: {document_id}"
        )
    
    try:
        return FileResponse(
            path=str(document_path),  # Convert to string
            media_type="application/pdf",
            filename=f"{document_id}.pdf",
            headers={
                "Content-Type": "application/pdf",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            }
        )
    except Exception as e:
        print(f"Error serving file: {e}")  # Debug log
        raise HTTPException(status_code=500, detail=str(e))

@document_router.options("/{document_id}/content")
async def options_document():
    return Response(
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*"
        }
    )

@upload_router.post("/")
async def upload_files(
    files: List[UploadFile] = File(...),
    set_name: str = Form(...),
    background_tasks: BackgroundTasks = None
):
    logger.debug("=== UPLOAD ENDPOINT CALLED ===")  # Test log
    try:
        if not files:
            raise HTTPException(status_code=400, detail="No files provided")

        # Create upload directory if it doesn't exist
        UPLOAD_DIR.mkdir(exist_ok=True)
        
        # Create indexer and storage instances
        processor = DocumentProcessor()
        storage = VectorStorage()
        indexer = DocumentIndexer()
        
        # Create contract_set_id first
        contract_set_id = str(uuid.uuid4())
        results = []
        uploaded_files = []
        
        # Then delete existing documents for this set
        try:
            storage.qdrant_client.delete(
                collection_name="documents",
                points_selector=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="contract_set_id",
                            match=models.MatchValue(value=contract_set_id)
                        )
                    ]
                )
            )
        except Exception as e:
            logger.warning(f"Error cleaning up old documents: {str(e)}")

        for file in files:
            try:
                print(f"Processing file: {file.filename}")
                if not file.filename.lower().endswith('.pdf'):
                    raise ValueError(f"File {file.filename} is not a PDF")
                
                # Save file to UPLOAD_DIR
                document_id = str(uuid.uuid4())
                document_path = UPLOAD_DIR / f"{document_id}.pdf"
                
                # Read file content
                content = await file.read()
                if len(content) == 0:
                    raise ValueError(f"File {file.filename} is empty")
                
                print(f"Saving file to {document_path}")
                # Save file
                with open(document_path, "wb") as f:
                    f.write(content)
                
                uploaded_files.append({"path": document_path, "id": document_id})
                
                # Process document and store chunks
                metadata = DocumentMetadata(
                    document_id=document_id,
                    contract_set_id=contract_set_id,
                    name=file.filename,
                    document_type="unknown",
                    level=1,
                    version="1",
                    hierarchy_context=HierarchyContext(
                        total_docs_in_set=len(files),
                        doc_position=files.index(file) + 1,
                        has_children=False
                    )
                )
                
                print(f"Processing document with metadata: {metadata}")
                section_chunks, detail_chunks = await processor.process_document_late_chunking(str(document_path), metadata)
                print(f"Generated {len(section_chunks)} section chunks and {len(detail_chunks)} detail chunks")
                
                print(f"Storing chunks in vector database")
                await storage.store_chunks(section_chunks + detail_chunks, contract_set_id)
                
                # Add to results
                results.append({
                    "id": document_id,
                    "name": file.filename,
                    "url": f"/api/documents/{document_id}"
                })
                print(f"Successfully processed {file.filename}")
                
            except Exception as e:
                print(f"Error processing {file.filename}: {str(e)}")
                # Clean up any uploaded files
                for uploaded in uploaded_files:
                    try:
                        if uploaded["path"].exists():
                            uploaded["path"].unlink()
                    except Exception as cleanup_error:
                        print(f"Error cleaning up file: {cleanup_error}")
                raise HTTPException(status_code=400, detail=str(e))

        if not results:
            raise HTTPException(status_code=400, detail="No files were successfully processed")
        
        response_data = {
            "id": contract_set_id,
            "name": set_name,
            "documents": results
        }
        
        print(f"Upload completed successfully. Response: {response_data}")
        return JSONResponse(
            content=response_data,
            headers={
                "Content-Type": "application/json",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Upload failed: {str(e)}")
        # Clean up any uploaded files
        for uploaded in uploaded_files:
            try:
                if uploaded["path"].exists():
                    uploaded["path"].unlink()
            except:
                pass
        raise HTTPException(status_code=400, detail=str(e))

@contract_sets_router.get("/")
async def get_contract_sets():
    storage = VectorStorage()
    
    # Get all unique contract sets from Qdrant
    response = storage.qdrant_client.scroll(
        collection_name=storage.collection_name,
        scroll_filter=None,
        limit=100,
        with_payload=True,
        with_vectors=False
    )
    
    # Group documents by contract set
    contract_sets: Dict[str, dict] = {}
    for point in response[0]:
        set_id = point.payload["contract_set_id"]
        doc_id = point.payload["document_id"]
        
        if set_id not in contract_sets:
            contract_sets[set_id] = {
                "id": set_id,
                "name": point.payload.get("name", "Unnamed Set"),
                "documents": set()
            }
        
        # Add document if not already added
        contract_sets[set_id]["documents"].add({
            "id": doc_id,
            "name": point.payload.get("name", "Unnamed Document"),
            "title": point.payload.get("title", ""),
            "author": point.payload.get("author", ""),
            "creation_date": point.payload.get("creation_date", "")
        })
    
    # Convert sets to list and document sets to lists
    result = []
    for set_data in contract_sets.values():
        set_data["documents"] = list(set_data["documents"])
        result.append(set_data)
    
    return result

# Mount the routers with the correct prefixes
app.include_router(document_router, prefix="/api/documents")
app.include_router(upload_router, prefix="/api/upload")
app.include_router(contract_sets_router, prefix="/api/contract-sets") 