import { NextRequest, NextResponse } from "next/server";

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const setName = formData.get("setName") as string;

    const backendFormData = new FormData();
    files.forEach((file) => backendFormData.append("files", file));
    backendFormData.append("set_name", setName);

    const backendUrl = `${process.env.BACKEND_URL}/api/upload/`;

    const backendResponse = await fetch(backendUrl, {
      method: "POST",
      body: backendFormData,
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      throw new Error(`Backend processing failed: ${errorText}`);
    }

    const backendData = await backendResponse.json();
    return NextResponse.json(backendData);
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to process upload",
      },
      { status: 500 }
    );
  }
}
