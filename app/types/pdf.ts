export interface PdfDocument {
  id: string;
  name: string;
  url: string;
  content?: string;
}

export function createPdfUrl(documentId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/documents/${documentId}/content`;
  console.log('Created PDF URL:', url);
  return url;
} 