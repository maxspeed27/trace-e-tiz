import { useState } from 'react';
import PDFViewer from './PDFViewer';
import ChatPanel from './ChatPanel';
import DocumentSelector from './DocumentSelector';
import { PdfFocusProvider } from '../contexts/PdfFocusContext';
import { PdfDocument } from '../types/pdf';

interface ContractSet {
  id: string;
  name: string;
  documents: PdfDocument[];
}

interface MainLayoutProps {
  contractSets: ContractSet[];
}

export default function MainLayout({ contractSets: initialSets }: MainLayoutProps) {
  const [contractSets, setContractSets] = useState(initialSets);
  const [selectedContractSet, setSelectedContractSet] = useState<string>('');
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [activeDocument, setActiveDocument] = useState<PdfDocument | null>(null);
  const [currentDocumentIndex, setCurrentDocumentIndex] = useState(0);

  const handleDocumentChange = (newIndex: number) => {
    if (newIndex >= 0 && newIndex < selectedDocuments.length) {
      const newDocId = selectedDocuments[newIndex];
      const newDoc = contractSets
        .find(set => set.id === selectedContractSet)
        ?.documents.find(doc => doc.id === newDocId);
      
      if (newDoc) {
        const sanitizedDoc = {
          ...newDoc,
          content: newDoc.content ? sanitizeDocumentContent(newDoc.content) : ''
        };
        setCurrentDocumentIndex(newIndex);
        setActiveDocument(sanitizedDoc);
      }
    }
  };

  const sanitizeDocumentContent = (content: string): string => {
    return content.replace(/[\x00-\x1F\x7F-\x9F]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const handleCitationClick = (documentId: string) => {
    const docIndex = selectedDocuments.findIndex(id => id === documentId);
    if (docIndex !== -1) {
      handleDocumentChange(docIndex);
    }
  };

  const getDocumentDisplayName = (documentId: string): string => {
    const parts = documentId.split('/');
    const filename = parts[parts.length - 1];
    return decodeURIComponent(filename.replace(/\.[^/.]+$/, ""));
  };

  return (
    <PdfFocusProvider>
      <div style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        overflow: 'hidden'
      }}>
        {/* Left Panel - Chat */}
        <div style={{
          width: '40%',
          height: '100%',
          borderRight: '1px solid #E5E7EB',
          overflow: 'hidden'
        }}>
          <ChatPanel 
            selectedDocuments={selectedDocuments.map(docId => {
              const doc = contractSets
                .find(set => set.id === selectedContractSet)
                ?.documents.find(d => d.id === docId);
              return {
                id: docId,
                name: doc?.name || getDocumentDisplayName(docId),
                url: doc?.url || ''
              };
            })}
            onCitationClick={handleCitationClick}
          />
        </div>

        {/* Right Panel - Document Viewer */}
        <div style={{
          width: '60%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{ flexShrink: 0 }}>
            <DocumentSelector
              selectedContractSet={selectedContractSet}
              setSelectedContractSet={setSelectedContractSet}
              selectedDocuments={selectedDocuments}
              setSelectedDocuments={setSelectedDocuments}
              setActiveDocument={setActiveDocument}
              contractSets={contractSets}
              setContractSets={setContractSets}
            />
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {activeDocument ? (
              <PDFViewer 
                file={activeDocument}
                containerClassName="h-full w-full"
                selectedDocuments={selectedDocuments}
                currentDocumentIndex={currentDocumentIndex}
                onDocumentChange={handleDocumentChange}
              />
            ) : (
              <div style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6B7280'
              }}>
                Select a document to view
              </div>
            )}
          </div>
        </div>
      </div>
    </PdfFocusProvider>
  );
} 