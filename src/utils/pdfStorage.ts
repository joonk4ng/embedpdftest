// PDF Storage utilities for IndexedDB
import Dexie, { type Table } from 'dexie';

/**
 * Annotation metadata stored as JSON (not burned into PDF)
 */
export interface AnnotationMetadata {
  // Unique identifier
  id: string;
  uid?: string;  // EmbedPDF UID if available
  
  // Annotation type
  type: 'ink' | 'text' | 'highlight' | 'comment' | 'stamp' | 'signature';
  subtype?: string;  // PDF annotation subtype
  
  // Page information
  pageIndex: number;  // 0-based page index
  
  // Coordinate information
  // Stored in multiple coordinate spaces for accuracy
  coordinates: {
    // Bounding rectangle [x1, y1, x2, y2] in rendered pixel space (for display)
    rect?: [number, number, number, number];
    
    // PDF coordinates (in points) - converted at creation time for accurate burning
    pdfCoordinates?: {
      // Bounding rectangle in PDF coordinate space (points)
      rect?: [number, number, number, number];
      
      // Ink list in PDF coordinate space
      inkList?: Array<{
        points: Array<{ x: number; y: number }>;
      }>;
      
      // Text position in PDF coordinate space
      textPosition?: { x: number; y: number };
    };
    
    // For ink annotations: array of strokes, each stroke is array of points (pixel space for display)
    inkList?: Array<{
      points: Array<{ x: number; y: number }>;
    }>;
    
    // For text annotations
    textPosition?: { x: number; y: number };
    textContent?: string;
    
    // For highlights: array of quads (rectangles)
    quads?: Array<[number, number, number, number, number, number, number, number]>;
  };
  
  // Coordinate space context (captured at annotation creation time)
  coordinateSpace?: {
    // Rendered page dimensions at creation time (pixels)
    renderedPageWidth: number;
    renderedPageHeight: number;
    
    // PDF page dimensions at creation time (points)
    pdfPageWidth: number;
    pdfPageHeight: number;
    
    // Scale factors used for conversion
    scaleX: number;  // pdfWidth / renderedWidth
    scaleY: number;  // pdfHeight / renderedHeight
    
    // Additional context
    zoomLevel?: number;
    devicePixelRatio?: number;
    scale?: number;  // From renderPage callback
  };
  
  // Visual properties
  color?: string;  // Hex color (e.g., '#000000')
  strokeWidth?: number;
  opacity?: number;
  
  // Metadata
  author?: string;
  createdAt: string;  // ISO timestamp
  modifiedAt?: string;  // ISO timestamp
  
  // Additional properties (for extensibility)
  properties?: Record<string, unknown>;
}

/**
 * Form field value metadata
 * Maps PDF field names to their values
 */
export interface FormFieldMetadata {
  // PDF field name -> value mapping
  fields: Record<string, string>;
  
  // Form type for context
  formType?: 'federal' | 'eest' | 'odf';
  
  // Last modified timestamp
  lastModified: string;
}

/**
 * Checkbox states metadata
 */
export interface CheckboxStatesMetadata {
  noMealsLodging?: boolean;
  noMeals?: boolean;
  travel?: boolean;
  noLunch?: boolean;
  hotline?: boolean;
  [key: string]: boolean | undefined;  // Extensible for other checkbox types
}

/**
 * Time entry metadata (for equipment/personnel entries)
 */
export interface TimeEntryMetadata {
  // Equipment entries
  equipmentEntries?: Array<{
    id?: number;
    date: string;
    start?: string;
    stop?: string;
    start1?: string;
    stop1?: string;
    start2?: string;
    stop2?: string;
    total?: string;
    quantity?: string;
    type?: string;
    remarks?: string;
  }>;
  
  // Personnel entries
  personnelEntries?: Array<{
    id?: number;
    date: string;
    name?: string;
    start1?: string;
    stop1?: string;
    start2?: string;
    stop2?: string;
    total?: string;
    remarks?: string;
  }>;
  
  // EEST time entries (if applicable)
  eestTimeEntries?: Array<{
    id?: number;
    date: string;
    start?: string;
    stop?: string;
    work?: string;
    special?: string;
  }>;
}

/**
 * Extended PDFData interface with metadata overlay
 */
export interface PDFData {
  // Existing fields (unchanged)
  id: string;
  pdf: Blob;  // Original PDF (never modified during editing)
  preview: Blob | null;
  metadata: {
    filename: string;
    date: string;
    crewNumber: string;
    fireName: string;
    fireNumber: string;
  };
  timestamp: string;
  
  // NEW: Metadata overlay fields
  
  /**
   * Form field values as JSON
   */
  formData?: FormFieldMetadata;
  
  /**
   * Annotations stored as JSON
   */
  annotations?: AnnotationMetadata[];
  
  /**
   * Checkbox states
   */
  checkboxStates?: CheckboxStatesMetadata;
  
  /**
   * Time entry data
   */
  timeEntries?: TimeEntryMetadata;
  
  /**
   * Version control for conflict resolution
   */
  version?: number;
  
  /**
   * Last modified timestamp (ISO string)
   */
  lastModified?: string;
  
  /**
   * Sync status
   */
  syncStatus?: {
    synced: boolean;
    syncedAt?: string;  // ISO timestamp
    syncError?: string;
    pendingChanges?: boolean;
  };
  
  /**
   * Rendering metadata
   */
  rendering?: {
    pageDimensions?: Array<{
      pageIndex: number;
      width: number;
      height: number;
      scale?: number;
    }>;
    zoomLevel?: number;
    devicePixelRatio?: number;
  };
  
  /**
   * Export metadata
   */
  exportMetadata?: {
    lastExported?: string;  // ISO timestamp
    exportVersion?: number;  // Version that was exported
    flattened?: boolean;
  };
}

class PDFStorageDB extends Dexie {
  pdfs!: Table<PDFData, string>;

  constructor() {
    super('ctr-pdf-storage');
    
    // Version 1: Original schema
    this.version(1).stores({
      pdfs: 'id, timestamp'
    });
    
    // Version 2: Add metadata overlay fields and indexes
    this.version(2).stores({
      pdfs: 'id, timestamp, lastModified, version'
    }).upgrade(async (tx) => {
      // Migration: Add default values to existing records
      const pdfs = await tx.table('pdfs').toArray();
      
      for (const pdf of pdfs) {
        const updates: Partial<PDFData> = {
          version: 1,
          lastModified: pdf.timestamp,
          syncStatus: {
            synced: false,
            pendingChanges: false
          }
        };
        
        await tx.table('pdfs').update(pdf.id, updates);
      }
      
      console.log(`✅ PDF Storage: Migrated ${pdfs.length} PDF records to version 2`);
    });
  }
}

const pdfStorageDB = new PDFStorageDB();

/**
 * Store PDF with metadata overlay support
 */
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
  },
  options?: {
    formData?: FormFieldMetadata;
    annotations?: AnnotationMetadata[];
    checkboxStates?: CheckboxStatesMetadata;
    timeEntries?: TimeEntryMetadata;
    rendering?: PDFData['rendering'];
  }
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await pdfStorageDB.pdfs.get(id);
  
  const pdfData: PDFData = {
    id,
    pdf,
    preview,
    metadata,
    timestamp: existing?.timestamp || now,
    // Metadata overlay fields
    formData: options?.formData,
    annotations: options?.annotations,
    checkboxStates: options?.checkboxStates,
    timeEntries: options?.timeEntries,
    rendering: options?.rendering,
    // Version control
    version: existing ? (existing.version || 1) + 1 : 1,
    lastModified: now,
    // Sync status
    syncStatus: existing?.syncStatus || {
      synced: false,
      pendingChanges: true
    }
  };
  
  await pdfStorageDB.pdfs.put(pdfData);
}

/**
 * Get PDF with all metadata
 */
export async function getPDF(id: string): Promise<PDFData | undefined> {
  return await pdfStorageDB.pdfs.get(id);
}

/**
 * Update form data metadata (lightweight update)
 */
export async function updateFormData(
  id: string,
  formData: FormFieldMetadata
): Promise<void> {
  const existing = await pdfStorageDB.pdfs.get(id);
  if (!existing) {
    throw new Error(`PDF with id ${id} not found`);
  }
  
  await pdfStorageDB.pdfs.update(id, {
    formData,
    version: (existing.version || 1) + 1,
    lastModified: new Date().toISOString(),
    syncStatus: {
      synced: existing.syncStatus?.synced || false,
      syncedAt: existing.syncStatus?.syncedAt,
      syncError: existing.syncStatus?.syncError,
      pendingChanges: true
    }
  });
}

/**
 * Update annotations metadata (lightweight update)
 */
export async function updateAnnotations(
  id: string,
  annotations: AnnotationMetadata[]
): Promise<void> {
  const existing = await pdfStorageDB.pdfs.get(id);
  if (!existing) {
    throw new Error(`PDF with id ${id} not found`);
  }
  
  await pdfStorageDB.pdfs.update(id, {
    annotations,
    version: (existing.version || 1) + 1,
    lastModified: new Date().toISOString(),
    syncStatus: {
      synced: existing.syncStatus?.synced || false,
      syncedAt: existing.syncStatus?.syncedAt,
      syncError: existing.syncStatus?.syncError,
      pendingChanges: true
    }
  });
}

/**
 * Update checkbox states
 */
export async function updateCheckboxStates(
  id: string,
  checkboxStates: CheckboxStatesMetadata
): Promise<void> {
  const existing = await pdfStorageDB.pdfs.get(id);
  if (!existing) {
    throw new Error(`PDF with id ${id} not found`);
  }
  
  await pdfStorageDB.pdfs.update(id, {
    checkboxStates,
    version: (existing.version || 1) + 1,
    lastModified: new Date().toISOString(),
    syncStatus: {
      synced: existing.syncStatus?.synced || false,
      syncedAt: existing.syncStatus?.syncedAt,
      syncError: existing.syncStatus?.syncError,
      pendingChanges: true
    }
  });
}

/**
 * Update time entries
 */
export async function updateTimeEntries(
  id: string,
  timeEntries: TimeEntryMetadata
): Promise<void> {
  const existing = await pdfStorageDB.pdfs.get(id);
  if (!existing) {
    throw new Error(`PDF with id ${id} not found`);
  }
  
  await pdfStorageDB.pdfs.update(id, {
    timeEntries,
    version: (existing.version || 1) + 1,
    lastModified: new Date().toISOString(),
    syncStatus: {
      synced: existing.syncStatus?.synced || false,
      syncedAt: existing.syncStatus?.syncedAt,
      syncError: existing.syncStatus?.syncError,
      pendingChanges: true
    }
  });
}

/**
 * Mark PDF as synced
 */
export async function markAsSynced(
  id: string,
  syncedAt?: string
): Promise<void> {
  await pdfStorageDB.pdfs.update(id, {
    syncStatus: {
      synced: true,
      syncedAt: syncedAt || new Date().toISOString(),
      pendingChanges: false
    }
  });
}

/**
 * Mark PDF sync as failed
 */
export async function markSyncFailed(
  id: string,
  error: string
): Promise<void> {
  const existing = await pdfStorageDB.pdfs.get(id);
  if (!existing) return;
  
  await pdfStorageDB.pdfs.update(id, {
    syncStatus: {
      ...existing.syncStatus,
      synced: false,
      syncError: error,
      pendingChanges: true
    }
  });
}

/**
 * Get all PDFs with pending changes (for sync)
 */
export async function getPDFsWithPendingChanges(): Promise<PDFData[]> {
  const allPDFs = await pdfStorageDB.pdfs.toArray();
  return allPDFs.filter(pdf => pdf.syncStatus?.pendingChanges === true);
}

/**
 * Update rendering metadata
 */
export async function updateRendering(
  id: string,
  rendering: PDFData['rendering']
): Promise<void> {
  await pdfStorageDB.pdfs.update(id, {
    rendering,
    lastModified: new Date().toISOString()
  });
}

/**
 * Update export metadata
 */
export async function updateExportMetadata(
  id: string,
  exportMetadata: PDFData['exportMetadata']
): Promise<void> {
  const existing = await pdfStorageDB.pdfs.get(id);
  if (!existing) return;
  
  await pdfStorageDB.pdfs.update(id, {
    exportMetadata,
    lastModified: new Date().toISOString()
  });
}

export async function listPDFs(): Promise<PDFData[]> {
  return await pdfStorageDB.pdfs.toArray();
}

export async function deletePDF(id: string): Promise<void> {
  await pdfStorageDB.pdfs.delete(id);
}

export async function clearAllPDFs(): Promise<void> {
  await pdfStorageDB.pdfs.clear();
  console.log('✅ PDF Storage: All PDFs cleared from IndexedDB');
}
