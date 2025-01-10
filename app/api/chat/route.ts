import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { message, documents } = await req.json();
    console.log("Chat API received:", { message, documents });

    if (!message || !documents) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const response = await fetch("http://localhost:8000/api/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: message,
        document_ids: Array.isArray(documents) ? documents : [documents],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Backend error:", errorText);
      throw new Error(`Backend error: ${errorText}`);
    }

    const data = await response.json();
    console.log("Backend response:", data);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
