import React from 'react';
import { useState, useEffect } from 'react';
import { usePdfFocus } from '../hooks/usePdfFocus';
import Citation from './Citation';
import { DocumentColorEnum } from '../constants/colors';
import { Citation as CitationType } from '../types/citation';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: {
    documentId: string;
    pageNumber: number;
    snippet: string;
    ticker: string;
    displayDate: string;
    color: DocumentColorEnum;
    documentName?: string;
  }[];
}

interface ChatPanelProps {
  selectedDocuments: Array<{
    id: string;
    name: string;
    url: string;
  }>;
  onCitationClick?: (documentId: string) => void;
}

export default function ChatPanel({ selectedDocuments, onCitationClick }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { setPdfFocusState } = usePdfFocus();

  useEffect(() => {
    const ensurePdfWorker = async () => {
      try {
        if (typeof window !== 'undefined') {
          const pdfjs = await import('pdfjs-dist');
          if (!pdfjs.GlobalWorkerOptions.workerSrc) {
            pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.js';
          }
        }
      } catch (error) {
        console.error('Failed to initialize PDF worker:', error);
      }
    };

    ensurePdfWorker();
  }, []);

  const getDocumentDisplayName = (documentId: string): string => {
    const parts = documentId.split('/');
    const filename = parts[parts.length - 1];
    return decodeURIComponent(filename.replace(/\.[^/.]+$/, ""));
  };

  const getDocumentName = (documentId: string): string => {
    const doc = selectedDocuments.find(d => d.id === documentId);
    return doc?.name || getDocumentDisplayName(documentId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !selectedDocuments.length || isLoading) return;

    setIsLoading(true);
    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          documents: selectedDocuments.map(doc => doc.id)
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      
      const transformedCitations = data.citations?.map((citation: any, index: number) => ({
        documentId: citation.document_id,
        pageNumber: citation.page_number,
        snippet: citation.text_snippet,
        ticker: `[${index + 1}]`,
        displayDate: '',
        color: DocumentColorEnum.yellow,
        documentName: citation.document_name || getDocumentName(citation.document_id)
      }));

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer,
        citations: transformedCitations
      }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, there was an error processing your request.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCitationClick = (citation: CitationType) => {
    setPdfFocusState({
      documentId: citation.documentId,
      pageNumber: citation.pageNumber,
      citation: {
        ...citation,
        color: citation.color || DocumentColorEnum.yellow,
      },
    });
    onCitationClick?.(citation.documentId);
  };

  const renderMessage = (message: Message) => {
    if (message.role === 'user') {
      return <div className="bg-gray-100 p-3 rounded">{message.content}</div>;
    }

    return (
      <div className="space-y-2">
        <div className="bg-white p-3 rounded border">{message.content}</div>
        {message.citations && message.citations.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.citations.map((citation, idx) => (
              <Citation 
                key={idx} 
                {...citation} 
                documentName={getDocumentName(citation.documentId)}
                onClick={() => handleCitationClick(citation)}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Messages Area */}
      <div 
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin" 
        style={{
          height: 'calc(100vh - 120px)',
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: '#E5E7EB transparent'
        }}
      >
        {messages.map((message, idx) => (
          <div key={idx} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] ${message.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'} rounded-lg p-3`}>
              {renderMessage(message)}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg p-3 animate-pulse">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="p-4 border-t bg-white flex-shrink-0">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={selectedDocuments.length ? "Ask a question..." : "Please select documents first"}
            disabled={!selectedDocuments.length || isLoading}
            className="w-full p-3 pr-12 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || !selectedDocuments.length || isLoading}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 text-blue-500 hover:text-blue-600 disabled:text-gray-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        {!selectedDocuments.length && (
          <p className="mt-2 text-sm text-gray-500">Select documents to start asking questions</p>
        )}
      </form>
    </div>
  );
} 