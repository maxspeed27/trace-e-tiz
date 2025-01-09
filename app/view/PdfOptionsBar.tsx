import React from 'react';
import { PdfDocument } from '../types/pdf';

export const PDFOptionsBar = ({
  file,
  selectedDocuments,
  currentDocumentIndex,
  onDocumentChange,
}: {
  file: PdfDocument;
  selectedDocuments: string[];
  currentDocumentIndex: number;
  onDocumentChange: (index: number) => void;
}) => {
  return (
    <div className="flex items-center justify-between p-2 border-b">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onDocumentChange(currentDocumentIndex - 1)}
          disabled={currentDocumentIndex <= 0}
          className="p-1 disabled:opacity-50"
        >
          ←
        </button>
        <button
          onClick={() => onDocumentChange(currentDocumentIndex + 1)}
          disabled={currentDocumentIndex >= selectedDocuments.length - 1}
          className="p-1 disabled:opacity-50"
        >
          →
        </button>
        <span className="text-sm text-gray-600">{file.name}</span>
      </div>
    </div>
  );
};

PDFOptionsBar.displayName = 'PDFOptionsBar';

export default PDFOptionsBar; 