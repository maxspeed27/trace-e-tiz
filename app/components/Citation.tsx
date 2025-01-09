import React from 'react';
import { usePdfFocus } from '../hooks/usePdfFocus';
import { DocumentColorEnum } from '../constants/colors';

interface CitationProps {
  documentId: string;
  pageNumber: number;
  snippet: string;
  ticker: string;
  displayDate: string;
  color: DocumentColorEnum;
  documentName?: string;
}

export default function Citation({ 
  documentId, 
  pageNumber, 
  snippet,
  ticker,
  displayDate,
  color,
  documentName,
  onClick
}: CitationProps & { onClick?: () => void }) {
  const { setPdfFocusState } = usePdfFocus();

  const handleClick = () => {
    setPdfFocusState({
      documentId,
      pageNumber,
      citation: {
        documentId,
        pageNumber,
        snippet,
        ticker,
        displayDate,
        color
      }
    });
    onClick?.();
  };

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-1 px-2 py-1 text-sm rounded ${color} hover:opacity-80`}
    >
      <span className="max-w-[150px] truncate">{documentName || ticker}</span>
      <span>•</span>
      <span>Page {pageNumber}</span>
      <span>•</span>
      <span>{displayDate}</span>
    </button>
  );
} 