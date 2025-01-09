import { createPdfUrl } from '../../types/pdf';

export async function GET() {
  try {
    const response = await fetch(`${process.env.BACKEND_URL}/api/documents`);
    const documents = await response.json();
    
    // Add debug logging
    console.log('Documents from backend:', documents);
    
    // Transform URLs in the response
    const transformedDocs = documents.map((doc: any) => ({
      ...doc,
      url: createPdfUrl(doc.id)
    }));

    console.log('Transformed documents:', transformedDocs);
    return Response.json(transformedDocs);
  } catch (error) {
    console.error('Failed to fetch documents:', error);
    return Response.json({ error: 'Failed to fetch documents' }, { status: 500 });
  }
} 