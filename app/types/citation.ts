import { DocumentColorEnum } from '../constants/colors';

export interface Citation {
  documentId: string;
  pageNumber: number;
  snippet: string;
  ticker: string;
  displayDate: string;
  color: DocumentColorEnum;
  documentName?: string;
} 