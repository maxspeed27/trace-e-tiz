import { NextResponse } from 'next/server';

async function fetchPDFFile(documentId: string): Promise<Response> {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
  console.log(`Fetching from backend: ${backendUrl}/api/documents/${documentId}/content`);
  
  const response = await fetch(`${backendUrl}/api/documents/${documentId}/content`, {
    headers: {
      'Accept': 'application/pdf',
      'Cache-Control': 'no-cache',
    },
    cache: 'no-store'  // Force fetch every time
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Backend error (${response.status}):`, errorText);
    throw new Error(`Failed to fetch PDF: ${errorText}`);
  }

  return response;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const response = await fetchPDFFile(params.id);
    const pdfData = await response.arrayBuffer();
    
    if (!pdfData || pdfData.byteLength === 0) {
      throw new Error('Empty PDF data received');
    }
    
    const dataView = new DataView(pdfData);
    const firstBytes = new Uint8Array(pdfData.slice(0, 5));
    const isPDF = String.fromCharCode.apply(null, Array.from(firstBytes)) === '%PDF-';
    if (!isPDF) {
      console.error('Invalid PDF data received');
      console.error('First bytes:', String.fromCharCode(...firstBytes));
      throw new Error('Invalid PDF data: Does not start with %PDF-');
    }
    
    console.log('PDF size:', pdfData.byteLength, 'bytes');
    
    return new NextResponse(pdfData, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': pdfData.byteLength.toString(),
        'Content-Disposition': `inline; filename="${params.id}.pdf"`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Error fetching PDF:', error);
    return new NextResponse(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }), 
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
    },
  });
} 