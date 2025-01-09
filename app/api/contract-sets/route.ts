import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('http://localhost:8000/api/contract-sets');
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend error:', errorText);
      throw new Error(`Backend processing failed: ${errorText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Contract sets fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contract sets' },
      { status: 500 }
    );
  }
} 