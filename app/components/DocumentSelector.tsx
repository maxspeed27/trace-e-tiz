import { useState, useCallback } from 'react';
import { PdfDocument, createPdfUrl } from '../types/pdf';

interface ContractSet {
  id: string;
  name: string;
  documents: PdfDocument[];
}

interface DocumentSelectorProps {
  selectedContractSet: string;
  setSelectedContractSet: (id: string) => void;
  selectedDocuments: string[];
  setSelectedDocuments: (docs: string[]) => void;
  activeDocument: PdfDocument | null;
  setActiveDocument: (doc: PdfDocument | null) => void;
  contractSets: ContractSet[];
  setContractSets: React.Dispatch<React.SetStateAction<ContractSet[]>>;
}

export default function DocumentSelector({
  selectedContractSet,
  setSelectedContractSet,
  selectedDocuments,
  setSelectedDocuments,
  activeDocument,
  setActiveDocument,
  contractSets,
  setContractSets,
}: DocumentSelectorProps) {
  const [error, setError] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = useCallback(async (files: FileList) => {
    setIsUploading(true);
    setError('');
    console.log('Starting upload of', files.length, 'files');

    try {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
        console.log('Adding file to form:', file.name);
      });

      const setName = `Contract Set ${new Date().toLocaleString()}`;
      formData.append('set_name', setName);
      console.log('Set name:', setName);

      console.log('Sending request to /api/upload');
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
        },
        body: formData
      });

      console.log('Response status:', response.status);
      const responseText = await response.text();
      console.log('Raw response text:', responseText);
      console.log('Response text length:', responseText.length);
      console.log('First 100 characters:', responseText.substring(0, 100));
      console.log('Is response text empty?', responseText.trim() === '');
      
      // Try to detect if there's any HTML in the response (which would indicate a server error page)
      if (responseText.includes('<!DOCTYPE html>') || responseText.includes('<html>')) {
        console.error('Received HTML instead of JSON response');
        throw new Error('Server returned HTML instead of JSON. Check server logs.');
      }

      if (!response.ok) {
        const errorDetail = responseText.includes('{') 
          ? JSON.parse(responseText).detail 
          : responseText;
        throw new Error(`Upload failed: ${errorDetail}`);
      }

      let data;
      try {
        data = JSON.parse(responseText);
        console.log('Parsed response data:', JSON.stringify(data, null, 2));
      } catch (e) {
        console.error('Failed to parse response as JSON:', e);
        console.error('Raw response that failed to parse:', responseText);
        throw new Error('Server returned invalid JSON');
      }

      // Validate the response structure
      if (!data || typeof data !== 'object') {
        console.error('Invalid response format - expected object, got:', typeof data);
        console.error('Data:', data);
        throw new Error('Server returned invalid data format');
      }

      console.log('Checking for contract_set_id in:', Object.keys(data));
      if (!data.id) {
        console.error('Response data missing id:', data);
        throw new Error('Server response missing contract set ID');
      }

      if (!Array.isArray(data.documents)) {
        console.error('Missing or invalid documents in response:', data);
        throw new Error('Server response missing documents');
      }

      const newContractSet = {
        id: data.id,
        name: data.name || setName,
        documents: data.documents.map((file: any) => ({
          id: file.id,
          name: file.name,
          url: file.url
        }))
      };
      
      console.log('Created new contract set:', newContractSet);
      setContractSets(prev => [...prev, newContractSet]);
      setSelectedContractSet(newContractSet.id);
    } catch (err) {
      console.error('Detailed upload error:', err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to upload files. Please try again.');
      }
    } finally {
      setIsUploading(false);
    }
  }, [setSelectedContractSet]);

  const handleFolderUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files);
    }
  }, [handleFileUpload]);

  const currentContractSet = contractSets.find(set => set.id === selectedContractSet);

  const handleContractSetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSetId = e.target.value;
    setSelectedContractSet(newSetId);
    setSelectedDocuments([]);
    setActiveDocument(null);
  };

  const handleDocumentSelect = (docId: string) => {
    const isSelected = selectedDocuments.includes(docId);
    let newSelected: string[];
    
    if (isSelected) {
        newSelected = selectedDocuments.filter(id => id !== docId);
    } else {
        newSelected = [...selectedDocuments, docId];
    }
    
    setSelectedDocuments(newSelected);

    if (currentContractSet) {
        const doc = currentContractSet.documents.find(d => d.id === docId);
        if (!activeDocument || newSelected.length === 1 || 
            (isSelected && activeDocument.id === docId)) {
            setActiveDocument(doc || null);
        }
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Contract Sets Dropdown */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Contract Set
        </label>
        <select
          value={selectedContractSet}
          onChange={handleContractSetChange}
          className="w-full p-2 border rounded-md"
        >
          <option value="">Select a contract set</option>
          {contractSets.map(set => (
            <option key={set.id} value={set.id}>
              {set.name}
            </option>
          ))}
        </select>
      </div>

      {/* Document List */}
      {currentContractSet && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Documents
          </label>
          <div className="border rounded-md divide-y">
            {currentContractSet.documents.map(doc => (
              <div key={doc.id} className="p-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedDocuments.includes(doc.id)}
                  onChange={() => handleDocumentSelect(doc.id)}
                  className="h-4 w-4 text-blue-600"
                />
                <span className="text-sm">{doc.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Section */}
      <div>
        <input
          type="file"
          multiple
          accept=".pdf"
          onChange={handleFolderUpload}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md cursor-pointer"
        >
          {isUploading ? 'Uploading...' : 'Upload Documents'}
        </label>
        {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
      </div>
    </div>
  );
} 