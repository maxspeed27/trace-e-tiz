import { DocumentColorEnum } from '../../constants/colors';

interface Citation {
  documentId: string;
  pageNumber: number;
  snippet: string;
  ticker: string;
  displayDate: string;
  color: DocumentColorEnum;
}

export function extractCitations(text: string, citations: any[]): Citation[] {
  // Just convert the backend citations to frontend format
  return citations.map(citation => ({
    documentId: citation.document_id,
    pageNumber: citation.page_number,
    snippet: citation.text_snippet,
    ticker: '',
    displayDate: '',
    color: DocumentColorEnum.yellow
  }));
} 