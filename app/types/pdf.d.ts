declare module "pdfjs-dist/build/pdf.worker.entry" {
  const workerEntry: string;
  export default workerEntry;
}

export interface PdfDocument {
  id: string;
  name: string;
  url: string;
  chunks: string[];
}
