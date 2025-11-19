/**
 * Debugging utility for tracing PDF signing system file calls
 * 
 * Usage:
 * 1. Enable debugging: Set ENABLE_SIGNING_DEBUG = true
 * 2. Debugging will run automatically in components
 * 3. Check browser console for detailed trace logs
 * 
 * To enable/disable: Set window.ENABLE_SIGNING_DEBUG = true/false in console
 */

import { getPDF, listPDFs } from './pdfStorage';

// Global debug flag - can be toggled in browser console
// Set window.ENABLE_SIGNING_DEBUG = true to enable, false to disable
export const ENABLE_SIGNING_DEBUG = 
  typeof window !== 'undefined' && (window as any).ENABLE_SIGNING_DEBUG !== false;

// Helper to check if debugging is enabled
export function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return (window as any).ENABLE_SIGNING_DEBUG !== false;
}

export interface SigningSystemTrace {
  stage: string;
  timestamp: string;
  pdfId?: string;
  pdfUrl?: string;
  pdfSize?: number;
  error?: string;
  details?: any;
}

const traces: SigningSystemTrace[] = [];

export function logTrace(stage: string, details?: any) {
  if (!isDebugEnabled()) return;
  
  const trace: SigningSystemTrace = {
    stage,
    timestamp: new Date().toISOString(),
    ...details
  };
  traces.push(trace);
  
  console.log(`🔍 [SIGNING TRACE] ${stage}`, {
    timestamp: trace.timestamp,
    ...details
  });
}

export function getTraces(): SigningSystemTrace[] {
  return [...traces];
}

export function clearTraces() {
  traces.length = 0;
  console.log('🔍 [SIGNING TRACE] Traces cleared');
}

/**
 * Comprehensive trace of the signing system
 * Checks all stages from storage to display
 */
export async function traceSigningSystem(pdfId: string = 'federal-form'): Promise<void> {
  if (!isDebugEnabled()) return;
  
  console.group('🔍 SIGNING SYSTEM TRACE');
  clearTraces();
  
  try {
    // Stage 1: Check IndexedDB storage
    logTrace('STAGE_1_CHECK_STORAGE', { pdfId });
    const allPDFs = await listPDFs();
    logTrace('STAGE_1_STORAGE_LIST', { 
      totalPDFs: allPDFs.length,
      pdfIds: allPDFs.map(p => p.id)
    });
    
    const storedPDF = await getPDF(pdfId);
    if (!storedPDF) {
      logTrace('STAGE_1_STORAGE_ERROR', { 
        error: 'PDF not found in IndexedDB',
        pdfId,
        availableIds: allPDFs.map(p => p.id)
      });
      console.error('❌ PDF not found in IndexedDB:', pdfId);
      console.error('Available PDFs:', allPDFs.map(p => p.id));
      console.groupEnd();
      return;
    }
    
    logTrace('STAGE_1_STORAGE_SUCCESS', {
      pdfId,
      pdfSize: storedPDF.pdf.size,
      hasPreview: !!storedPDF.preview,
      metadata: storedPDF.metadata
    });
    console.log('✅ PDF found in IndexedDB:', {
      id: storedPDF.id,
      size: storedPDF.pdf.size,
      type: storedPDF.pdf.type,
      metadata: storedPDF.metadata
    });
    
    // Stage 2: Validate PDF blob
    logTrace('STAGE_2_VALIDATE_BLOB', { pdfId });
    if (storedPDF.pdf.size === 0) {
      logTrace('STAGE_2_BLOB_ERROR', { error: 'PDF blob is empty' });
      console.error('❌ PDF blob is empty');
      console.groupEnd();
      return;
    }
    
    // Check PDF header
    const arrayBuffer = await storedPDF.pdf.slice(0, 4).arrayBuffer();
    const headerBytes = new Uint8Array(arrayBuffer);
    const header = String.fromCharCode(...headerBytes);
    
    if (header !== '%PDF') {
      logTrace('STAGE_2_BLOB_ERROR', { 
        error: 'Invalid PDF header',
        header 
      });
      console.error('❌ Invalid PDF header:', header);
      console.groupEnd();
      return;
    }
    
    logTrace('STAGE_2_BLOB_SUCCESS', {
      pdfId,
      size: storedPDF.pdf.size,
      header
    });
    console.log('✅ PDF blob is valid:', {
      size: storedPDF.pdf.size,
      type: storedPDF.pdf.type,
      header
    });
    
    // Stage 3: Test blob URL creation
    logTrace('STAGE_3_CREATE_BLOB_URL', { pdfId });
    const blobUrl = URL.createObjectURL(storedPDF.pdf);
    logTrace('STAGE_3_BLOB_URL_CREATED', {
      pdfId,
      blobUrl,
      urlLength: blobUrl.length
    });
    console.log('✅ Blob URL created:', blobUrl);
    
    // Stage 4: Test blob URL accessibility
    logTrace('STAGE_4_TEST_BLOB_URL', { pdfId, blobUrl });
    try {
      const response = await fetch(blobUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const fetchedBlob = await response.blob();
      
      logTrace('STAGE_4_BLOB_URL_SUCCESS', {
        pdfId,
        blobUrl,
        fetchedSize: fetchedBlob.size,
        responseStatus: response.status
      });
      console.log('✅ Blob URL is accessible:', {
        url: blobUrl,
        fetchedSize: fetchedBlob.size,
        status: response.status
      });
    } catch (fetchError) {
      logTrace('STAGE_4_BLOB_URL_ERROR', {
        pdfId,
        blobUrl,
        error: fetchError instanceof Error ? fetchError.message : String(fetchError)
      });
      console.error('❌ Blob URL is not accessible:', fetchError);
      URL.revokeObjectURL(blobUrl);
      console.groupEnd();
      return;
    }
    
    // Stage 5: Check EmbedPDF readiness
    logTrace('STAGE_5_CHECK_EMBEDPDF', { pdfId, blobUrl });
    console.log('✅ All file loading checks passed');
    console.log('📋 Next steps:');
    console.log('  1. Verify EmbedPDF engine is initialized');
    console.log('  2. Check EmbedPDF plugins are registered');
    console.log('  3. Verify PDFLoaderTrigger component is mounted');
    console.log('  4. Check EmbedPDF loader events in console');
    
    // Clean up
    URL.revokeObjectURL(blobUrl);
    
    logTrace('STAGE_5_COMPLETE', {
      pdfId,
      blobUrl,
      allStagesPassed: true
    });
    
  } catch (error) {
    logTrace('TRACE_ERROR', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    console.error('❌ Error during trace:', error);
  }
  
  console.groupEnd();
  
  // Print summary
  console.log('📊 Trace Summary:', {
    totalStages: traces.length,
    errors: traces.filter(t => t.error).length,
    pdfId,
    traces: traces.map(t => ({
      stage: t.stage,
      timestamp: t.timestamp,
      error: t.error
    }))
  });
}

/**
 * Quick check: Is PDF available for signing?
 * This runs automatically in components when debugging is enabled
 */
export async function quickCheckPDF(pdfId: string = 'federal-form'): Promise<{
  available: boolean;
  error?: string;
  details?: any;
}> {
  if (!isDebugEnabled()) {
    // Still return result even if debugging is disabled
    try {
      const storedPDF = await getPDF(pdfId);
      return {
        available: !!storedPDF && storedPDF.pdf.size > 0
      };
    } catch {
      return { available: false };
    }
  }
  
  try {
    const storedPDF = await getPDF(pdfId);
    if (!storedPDF) {
      return {
        available: false,
        error: 'PDF not found in IndexedDB',
        details: { pdfId }
      };
    }
    
    if (storedPDF.pdf.size === 0) {
      return {
        available: false,
        error: 'PDF blob is empty',
        details: { pdfId, size: 0 }
      };
    }
    
    // Quick header check
    const arrayBuffer = await storedPDF.pdf.slice(0, 4).arrayBuffer();
    const headerBytes = new Uint8Array(arrayBuffer);
    const header = String.fromCharCode(...headerBytes);
    
    if (header !== '%PDF') {
      return {
        available: false,
        error: 'Invalid PDF format',
        details: { pdfId, header }
      };
    }
    
    return {
      available: true,
      details: {
        pdfId,
        size: storedPDF.pdf.size,
        type: storedPDF.pdf.type,
        metadata: storedPDF.metadata
      }
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
      details: { pdfId }
    };
  }
}

/**
 * Check all PDFs in storage
 */
export async function checkAllPDFs(): Promise<void> {
  if (!isDebugEnabled()) return;
  
  console.group('🔍 CHECKING ALL PDFs IN STORAGE');
  try {
    const allPDFs = await listPDFs();
    console.log(`Found ${allPDFs.length} PDF(s) in storage:`);
    
    for (const pdf of allPDFs) {
      console.group(`PDF: ${pdf.id}`);
      console.log('Size:', pdf.pdf.size, 'bytes');
      console.log('Type:', pdf.pdf.type);
      console.log('Has Preview:', !!pdf.preview);
      console.log('Metadata:', pdf.metadata);
      console.log('Timestamp:', pdf.timestamp);
      
      // Quick validation
      if (pdf.pdf.size === 0) {
        console.warn('⚠️ PDF blob is empty!');
      } else {
        try {
          const arrayBuffer = await pdf.pdf.slice(0, 4).arrayBuffer();
          const headerBytes = new Uint8Array(arrayBuffer);
          const header = String.fromCharCode(...headerBytes);
          if (header === '%PDF') {
            console.log('✅ Valid PDF header');
          } else {
            console.error('❌ Invalid PDF header:', header);
          }
        } catch (e) {
          console.error('❌ Error checking PDF header:', e);
        }
      }
      console.groupEnd();
    }
  } catch (error) {
    console.error('❌ Error checking PDFs:', error);
  }
  console.groupEnd();
}

