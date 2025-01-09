import { useState, useRef } from 'react';
import { PdfDocument } from '../types/pdf';
import { PdfFocusHandler } from '../view/VirtualizedPdf';

export const usePDFViewer = (file: PdfDocument) => {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPageNumber] = useState(0);
  const pdfFocusRef = useRef<PdfFocusHandler>(null);

  const goToPage = (page: number) => {
    const pageIndex = Math.max(0, Math.min(page - 1, numPages - 1));
    setCurrentPageNumber(pageIndex);
    pdfFocusRef.current?.scrollToPage(pageIndex);
  };

  return {
    scale: 1.0, // Fixed scale
    setScaleFit: () => {}, // No-op
    numPages,
    setNumPages,
    setCurrentPageNumber,
    pdfFocusRef,
  };
}; 