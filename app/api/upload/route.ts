import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createPdfUrl } from '../../types/pdf';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const setName = formData.get('set_name') as string;
    
    if (!setName) {
      return NextResponse.json(
        { error: 'Set name is required' },
        { status: 422 }
      );
    }
    
    const backendFormData = new FormData();
    files.forEach(file => {
      backendFormData.append('files', file);
    });
    backendFormData.append('set_name', setName);

    console.log('Sending to backend:', {
      files: files.map(f => f.name),
      setName
    });

    const backendResponse = await fetch(`${process.env.BACKEND_URL}/api/upload`, {
      method: 'POST',
      body: backendFormData,
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      console.error('Backend error:', errorText);
      throw new Error(`Backend processing failed: ${errorText}`);
    }

    const backendData = await backendResponse.json();
    
    const transformedData = {
      ...backendData,
      documents: backendData.documents?.map((doc: any) => ({
        ...doc,
        url: createPdfUrl(doc.id)
      }))
    };

    return NextResponse.json(transformedData);
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process upload' },
      { status: 500 }
    );
  }
} 