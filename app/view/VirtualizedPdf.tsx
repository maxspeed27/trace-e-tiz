import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { useState, forwardRef, useRef, useMemo, useEffect, useCallback, useImperativeHandle } from 'react';
import { PdfDocument } from '../types/pdf';
import { usePdfFocus } from '../hooks/usePdfFocus';
import { DocumentColorEnum } from '../constants/colors';
import { multiHighlight } from '../utils/multi-line-highlight';

// Initialize pdfjs worker with local file
if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
}

export interface PdfFocusHandler {
  scrollToPage: (pageNumber: number) => void;
}

interface VirtualizedPDFProps {
  file: PdfDocument;
  setIndex: (index: number) => void;
  setNumPages: (pages: number) => void;
  onError?: (error: Error) => void;
  selectedDocuments: string[];
  currentDocumentIndex: number;
  onDocumentChange: (index: number) => void;
}

export const VirtualizedPDF = forwardRef<PdfFocusHandler, VirtualizedPDFProps>(
  ({ file, setIndex, setNumPages, onError, selectedDocuments, currentDocumentIndex, onDocumentChange }, ref) => {
    const [pageCount, setPageCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);
    const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
    const { pdfFocusState } = usePdfFocus();

    const memoizedFile = useMemo(() => ({ url: file.url }), [file.url]);

    useEffect(() => {
      if (!pdfFocusState.citation) {
        console.log('No citation in focus state');
        return;
      }
      
      const citation = pdfFocusState.citation;
      console.log('Citation clicked:', {
        citation,
        fileId: file.id,
        documentId: pdfFocusState.documentId,
        pageNumber: pdfFocusState.pageNumber,
        pageCount
      });
      
      if (
        pdfFocusState.documentId === file.id && 
        pdfFocusState.pageNumber > 0 && 
        pdfFocusState.pageNumber <= pageCount
      ) {
        const pageRef = pageRefs.current[pdfFocusState.pageNumber - 1];
        if (!pageRef) {
          console.warn('Page ref not found');
          return;
        }

        const container = containerRef.current;
        if (!container) {
          console.warn('Container ref not found');
          return;
        }

        const pageTop = pageRef.offsetTop;
        container.scrollTo({
          top: pageTop - 20,
          behavior: 'smooth'
        });
        
        // Give PDF.js time to render the text layer
        const attemptHighlight = (attempts = 0) => {
          if (attempts > 10) {
            console.warn('Max highlight attempts reached');
            return;
          }
          
          const textLayer = pageRef.querySelector('.react-pdf__Page__textContent');
          console.log('Text layer found:', {
            hasTextLayer: !!textLayer,
            childrenCount: textLayer?.children.length
          });
          
          if (textLayer && textLayer.children.length > 0) {
            // Remove any existing highlights first
            const existingHighlights = document.querySelectorAll('.highlight-wrapper');
            existingHighlights.forEach(el => el.remove());
            
            // Wait a bit for the text layer to stabilize
            setTimeout(() => {
              console.log('Attempting highlight with:', {
                snippet: citation.snippet,
                pageNumber: pdfFocusState.pageNumber - 1
              });
              
              const success = multiHighlight(
                citation.snippet,
                pdfFocusState.pageNumber - 1,
                citation.color
              );
              
              console.log('Highlight attempt result:', success);
              
              if (!success && attempts < 10) {
                setTimeout(() => attemptHighlight(attempts + 1), 100);
              }
            }, 100);
          } else {
            setTimeout(() => attemptHighlight(attempts + 1), 100);
          }
        };

        attemptHighlight();
      } else {
        console.warn('Citation does not match current document', {
          citationDocId: pdfFocusState.documentId,
          fileId: file.id,
          citationPage: pdfFocusState.pageNumber,
          pageCount
        });
      }
    }, [pdfFocusState, file.id, pageCount]);

    useImperativeHandle(ref, () => ({
      scrollToPage: (pageNumber: number) => {
        pageRefs.current[pageNumber]?.scrollIntoView({ behavior: 'smooth' });
      }
    }));

    return (
      <div className="h-full w-full overflow-hidden">
        <Document
          file={memoizedFile}
          onLoadSuccess={({ numPages }) => {
            setPageCount(numPages);
            setNumPages(numPages);
            setIsLoading(false);
          }}
          onLoadError={onError}
          loading={<div>Loading PDF...</div>}
          className="h-full"
        >
          <div 
            ref={containerRef}
            style={{
              height: '100vh',
              overflowY: 'scroll',
              scrollBehavior: 'smooth',
              WebkitOverflowScrolling: 'touch',
              backgroundColor: '#f5f5f5',
            }}
          >
            <div className="flex flex-col items-center gap-8 py-6">
              {!isLoading && Array.from(new Array(pageCount), (_, index) => (
                <div 
                  ref={el => { pageRefs.current[index] = el; }} 
                  key={`page_${index + 1}_${file.url}`}
                  className="w-full flex justify-center px-4"
                >
                  <Page
                    pageNumber={index + 1}
                    className="border-b border-gray-200 shadow-lg"
                    width={800}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    loading={<div className="bg-gray-100 p-4">Loading page {index + 1}...</div>}
                    error={<div className="bg-red-100 p-4">Error loading page {index + 1}</div>}
                  />
                </div>
              ))}
            </div>
          </div>
        </Document>
      </div>
    );
  }
);

VirtualizedPDF.displayName = 'VirtualizedPDF'; 