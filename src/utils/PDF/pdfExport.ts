// PDF Export utility - Burns metadata overlay into PDF only on final export
import * as PDFLib from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { getPDF, updateExportMetadata } from '../pdfStorage';
import { savePDFWithEmbedPDFSignature } from './unifiedSignatureHandler';

/**
 * Export PDF with metadata burned in (form data + annotations)
 * This is the ONLY place where we modify the PDF binary
 */
export async function exportPDFWithMetadata(
  pdfId: string,
  options?: {
    flatten?: boolean;
    includeAnnotations?: boolean;
    includeFormData?: boolean;
  }
): Promise<Blob> {
  const flatten = options?.flatten !== false; // Default to true
  const includeAnnotations = options?.includeAnnotations !== false; // Default to true
  const includeFormData = options?.includeFormData !== false; // Default to true

  console.log('🔍 exportPDFWithMetadata: Starting export for PDF:', pdfId);
  
  // Load PDF data with metadata
  const pdfData = await getPDF(pdfId);
  if (!pdfData) {
    throw new Error(`PDF with id ${pdfId} not found`);
  }

  // Load original PDF (unchanged binary)
  const originalPdfBytes = await pdfData.pdf.arrayBuffer();
  const pdfDoc = await PDFLib.PDFDocument.load(originalPdfBytes);
  
  console.log('🔍 exportPDFWithMetadata: Loaded original PDF, size:', originalPdfBytes.byteLength);

  // Apply form data from metadata
  if (includeFormData && pdfData.formData?.fields) {
    try {
      console.log('🔍 exportPDFWithMetadata: Applying form data from metadata...');
      const form = pdfDoc.getForm();
      const fields = pdfData.formData.fields;
      
      let filledCount = 0;
      Object.entries(fields).forEach(([fieldName, value]) => {
        try {
          const field = form.getField(fieldName);
          if (field) {
            const hasSetText = typeof (field as any).setText === 'function';
            const hasCheck = typeof (field as any).check === 'function';
            const hasSelect = typeof (field as any).select === 'function';
            
            if (hasSetText) {
              (field as any).setText(value);
              filledCount++;
            } else if (hasCheck) {
              if (value === 'Yes' || value === 'On' || value === 'YES' || value === 'HOURS') {
                (field as any).check();
              } else {
                (field as any).uncheck();
              }
              filledCount++;
            } else if (hasSelect) {
              (field as any).select(value);
              filledCount++;
            }
          }
        } catch (fieldError) {
          console.warn(`⚠️ exportPDFWithMetadata: Error filling field ${fieldName}:`, fieldError);
        }
      });
      
      console.log(`✅ exportPDFWithMetadata: Applied ${filledCount} form fields from metadata`);
    } catch (formError) {
      console.error('⚠️ exportPDFWithMetadata: Error applying form data:', formError);
      // Continue even if form data application fails
    }
  }

  // Apply annotations from metadata
  if (includeAnnotations && pdfData.annotations && pdfData.annotations.length > 0) {
    try {
      console.log('🔍 exportPDFWithMetadata: Applying annotations from metadata...');
      
      // Get page dimensions from rendering metadata or calculate from PDF
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      const pdfPageWidth = firstPage.getWidth();
      const pdfPageHeight = firstPage.getHeight();
      
      let renderedPageWidth = pdfPageWidth;
      let renderedPageHeight = pdfPageHeight;
      
      if (pdfData.rendering?.pageDimensions && pdfData.rendering.pageDimensions.length > 0) {
        const pageDim = pdfData.rendering.pageDimensions[0];
        renderedPageWidth = pageDim.width;
        renderedPageHeight = pageDim.height;
        console.log('🔍 exportPDFWithMetadata: Using stored rendering dimensions:', {
          width: renderedPageWidth,
          height: renderedPageHeight
        });
      }
      
      // Convert annotations metadata back to EmbedPDF format for signature handler
      // We need to reconstruct the annotation state structure
      const annotationState = {
        byUid: pdfData.annotations.reduce((acc, ann) => {
          const uid = ann.uid || ann.id;
          acc[uid] = {
            id: uid,
            uid: uid,
            type: ann.type === 'ink' ? 15 : ann.type,
            subtype: ann.subtype || ann.type,
            pageIndex: ann.pageIndex,
            rect: ann.coordinates.rect,
            color: ann.color || '#000000',
            strokeWidth: ann.strokeWidth || 3,
            opacity: ann.opacity !== undefined ? ann.opacity : 1,
            inkList: ann.coordinates.inkList || [],
            object: {
              id: uid,
              type: ann.type === 'ink' ? 15 : ann.type,
              subtype: ann.subtype || ann.type,
              pageIndex: ann.pageIndex,
              rect: ann.coordinates.rect,
              color: ann.color || '#000000',
              strokeWidth: ann.strokeWidth || 3,
              opacity: ann.opacity !== undefined ? ann.opacity : 1,
              inkList: ann.coordinates.inkList || []
            }
          };
          return acc;
        }, {} as Record<string, any>),
        pages: pdfData.annotations.reduce((acc, ann) => {
          const pageKey = ann.pageIndex.toString();
          if (!acc[pageKey]) {
            acc[pageKey] = [];
          }
          acc[pageKey].push(ann.uid || ann.id);
          return acc;
        }, {} as Record<string, string[]>),
        hasPendingChanges: false
      };
      
      // Use unified signature handler to embed annotations
      const signedPdfBytes = await savePDFWithEmbedPDFSignature(
        await pdfDoc.save(),
        annotationState,
        renderedPageWidth,
        renderedPageHeight,
        0, // pageIndex
        false // Don't flatten yet, we'll do it below
      );
      
      // Reload the PDF with annotations embedded
      const pdfDocWithAnnotations = await PDFLib.PDFDocument.load(signedPdfBytes);
      
      // Replace the current pdfDoc with the one that has annotations
      // We need to create a new document and copy pages
      const newPdfDoc = await PDFLib.PDFDocument.create();
      const [copiedPage] = await newPdfDoc.copyPages(pdfDocWithAnnotations, [0]);
      newPdfDoc.addPage(copiedPage);
      
      // Note: Form fields are already copied with the page when copying pages
      
      console.log(`✅ exportPDFWithMetadata: Applied ${pdfData.annotations.length} annotations from metadata`);
      
      // Use the document with annotations
      const finalBytes = await newPdfDoc.save();
      const finalDoc = await PDFLib.PDFDocument.load(finalBytes);
      
      // Flatten if requested
      if (flatten) {
        try {
          const form = finalDoc.getForm();
          form.flatten();
          console.log('✅ exportPDFWithMetadata: Form flattened');
        } catch (flattenError) {
          console.warn('⚠️ exportPDFWithMetadata: Could not flatten form:', flattenError);
        }
      }
      
      const exportedBytes = await finalDoc.save();
      
      // Update export metadata
      await updateExportMetadata(pdfId, {
        lastExported: new Date().toISOString(),
        exportVersion: pdfData.version || 1,
        flattened: flatten
      });
      
      return new Blob([exportedBytes], { type: 'application/pdf' });
    } catch (annotationError) {
      console.error('⚠️ exportPDFWithMetadata: Error applying annotations:', annotationError);
      // Continue without annotations if they fail
    }
  }

  // Flatten if requested
  if (flatten) {
    try {
      const form = pdfDoc.getForm();
      form.flatten();
      console.log('✅ exportPDFWithMetadata: Form flattened');
    } catch (flattenError) {
      console.warn('⚠️ exportPDFWithMetadata: Could not flatten form:', flattenError);
    }
  }

  // Save and return
  const exportedBytes = await pdfDoc.save();
  
  // Update export metadata
  await updateExportMetadata(pdfId, {
    lastExported: new Date().toISOString(),
    exportVersion: pdfData.version || 1,
    flattened: flatten
  });
  
  console.log('✅ exportPDFWithMetadata: Export complete, size:', exportedBytes.byteLength);
  return new Blob([exportedBytes], { type: 'application/pdf' });
}

/**
 * Create a preview image from exported PDF
 */
export async function createPDFPreview(pdfBlob: Blob, scale: number = 2.0): Promise<Blob> {
  try {
    const pdfjsDoc = await pdfjsLib.getDocument({ data: await pdfBlob.arrayBuffer() }).promise;
    const pdfjsPage = await pdfjsDoc.getPage(1);
    const previewViewport = pdfjsPage.getViewport({ scale });
    
    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = previewViewport.width;
    previewCanvas.height = previewViewport.height;
    const ctx = previewCanvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    await pdfjsPage.render({ canvasContext: ctx, viewport: previewViewport }).promise;
    
    return new Promise<Blob>((resolve, reject) => {
      previewCanvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      }, 'image/png');
    });
  } catch (error) {
    console.error('Error creating PDF preview:', error);
    throw error;
  }
}

