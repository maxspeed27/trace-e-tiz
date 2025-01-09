from typing import Optional
from pydantic import BaseModel

class HierarchyContext(BaseModel):
    total_docs_in_set: int = 1
    doc_position: int = 1
    has_children: bool = False

class DocumentMetadata(BaseModel):
    document_id: str
    contract_set_id: str
    name: str
    document_type: str
    level: int
    hierarchy_context: Optional[HierarchyContext] = None
    pdf_metadata: Optional[dict] = None
    parent_document_id: Optional[str] = None
    effective_date: Optional[str] = None

class TextChunk(BaseModel):
    text: str
    metadata: DocumentMetadata
    page_number: int
    chunk_id: str
    section_id: str
    section_reference: Optional[str] = None
    level_in_document: int
    parent_id: Optional[str] = None 