import { useContext } from 'react';
import { PdfFocusContext } from '../contexts/PdfFocusContext';

export const usePdfFocus = () => {
  const context = useContext(PdfFocusContext);
  if (!context) {
    throw new Error('usePdfFocus must be used within a PdfFocusProvider');
  }
  return context;
}; 