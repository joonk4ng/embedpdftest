// PDF Storage utilities for IndexedDB
import Dexie, { type Table } from 'dexie';

export interface PDFData {
  id: string;
  pdf: Blob;
  preview: Blob | null;
  metadata: {
    filename: string;
    date: string;
    crewNumber: string;
    fireName: string;
    fireNumber: string;
  };
  timestamp: string;
}

class PDFStorageDB extends Dexie {
  pdfs!: Table<PDFData, string>;

  constructor() {
    super('ctr-pdf-storage');
    this.version(1).stores({
      pdfs: 'id, timestamp'
    });
  }
}

const pdfStorageDB = new PDFStorageDB();

export async function storePDFWithId(
  id: string,
  pdf: Blob,
  preview: Blob | null,
  metadata: {
    filename: string;
    date: string;
    crewNumber: string;
    fireName: string;
    fireNumber: string;
  }
): Promise<void> {
  const pdfData: PDFData = {
    id,
    pdf,
    preview,
    metadata,
    timestamp: new Date().toISOString()
  };
  await pdfStorageDB.pdfs.put(pdfData);
}

export async function getPDF(id: string): Promise<PDFData | undefined> {
  return await pdfStorageDB.pdfs.get(id);
}

export async function listPDFs(): Promise<PDFData[]> {
  return await pdfStorageDB.pdfs.toArray();
}

export async function deletePDF(id: string): Promise<void> {
  await pdfStorageDB.pdfs.delete(id);
}



