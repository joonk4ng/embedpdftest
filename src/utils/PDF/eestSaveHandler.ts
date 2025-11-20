// EEST Save Handler utility for saving and downloading EEST PDFs with form-specific features
import * as pdfjsLib from 'pdfjs-dist';
// import * as PDFLib from 'pdf-lib'; // Not used in this function
import { flattenPDFToImage, createFlattenedPDF, hasSignature, canvasToBlob } from './pdfFlattening';
import { generateExportFilename, type ExportInfo } from '../filenameGenerator';
import { FormType, savePDFMetadata, type EESTFormData, type EESTTimeEntry } from '../engineTimeDB';
import { mapEESTToPDFFields, validateEESTFormData } from '../fieldmapper/eestFieldMapper';
import type { PDFGenerationMetadata } from '../types';

export interface EESTCrewInfo {
  agreementNumber: string;
  resourceOrderNumber: string;
  contractorAgencyName: string;
  incidentName: string;
  incidentNumber: string;
  operatorName: string;
  equipmentMake: string;
  equipmentModel: string;
  serialNumber: string;
  licenseNumber: string;
  equipmentStatus: string;
  equipmentUse?: string;
  invoicePostedBy: string;
  dateSigned: string;
  remarks: string;
  remarksOptions: string[];
  customRemarks: string[];
}

export interface EESTSaveOptions {
  crewInfo?: EESTCrewInfo;
  formData?: EESTFormData;
  timeEntries?: EESTTimeEntry[];
  date?: string;
  filename?: string;
  incidentName?: string;
  incidentNumber?: string;
  contractorAgencyName?: string;
  isSigned?: boolean;
}

/**
 * Handles saving an EEST PDF with signature (flattened) and form data
 * 
 * @deprecated This function uses the legacy canvas-based approach.
 * Use the unified signature handler (savePDFWithEmbedPDFSignature) instead,
 * which works directly with EmbedPDF annotation state.
 * This function is kept for backward compatibility only.
 */
export async function saveEESTPDFWithSignature(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  baseCanvas: HTMLCanvasElement,
  drawCanvas: HTMLCanvasElement,
  onSave: (pdfData: Blob, previewImage: Blob) => void,
  options: EESTSaveOptions = {},
  _pdfId?: string
): Promise<void> {
  try {
    console.log('🔍 EESTSaveHandler: Starting EEST PDF save process...');

    // Validate EEST form data if provided
    if (options.formData && options.timeEntries) {
      const validation = validateEESTFormData(options.formData, options.timeEntries);
      if (!validation.isValid) {
        console.warn('EESTSaveHandler: Form validation warnings:', validation.errors);
        // Continue with save but log warnings
      }
    }

    // Create a temporary canvas to combine both layers for preview
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = baseCanvas.width;
    tempCanvas.height = baseCanvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    if (!tempCtx) throw new Error('Failed to get canvas context');

    // Draw the base PDF
    tempCtx.drawImage(baseCanvas, 0, 0);
    // Draw the annotations on top
    tempCtx.drawImage(drawCanvas, 0, 0);

    // Get the combined preview as PNG
    const previewImage = await canvasToBlob(tempCanvas);

    // Check if there's a signature to flatten
    const hasSig = hasSignature(drawCanvas);
    console.log('🔍 EESTSaveHandler: Signature check result:', hasSig);
    console.log('🔍 EESTSaveHandler: Draw canvas dimensions:', { width: drawCanvas.width, height: drawCanvas.height });
    console.log('🔍 EESTSaveHandler: Base canvas dimensions:', { width: baseCanvas.width, height: baseCanvas.height });

    // Use the provided PDF document (already filled by PDFLib)
    let populatedPdfDoc = pdfDoc;
    console.log('🔍 EESTSaveHandler: Using already-filled PDF from PDFLib');
    console.log('🔍 EESTSaveHandler: PDF form data was populated by EESTTimeTable using PDFLib');

    // Create a high-resolution combined canvas for the flattened PDF
    console.log('🔍 EESTSaveHandler: Creating high-resolution flattened PDF image...');
    const flattenedPdfImage = await flattenPDFToImage(populatedPdfDoc);
    console.log('🔍 EESTSaveHandler: Flattened PDF image dimensions:', { width: flattenedPdfImage.width, height: flattenedPdfImage.height });
    
    // Create a high-resolution combined canvas
    const highResCanvas = document.createElement('canvas');
    highResCanvas.width = flattenedPdfImage.width;
    highResCanvas.height = flattenedPdfImage.height;
    const highResCtx = highResCanvas.getContext('2d', {
      alpha: false,
      willReadFrequently: false,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high'
    }) as CanvasRenderingContext2D;
    
    if (!highResCtx) throw new Error('Failed to get high-res canvas context');
    
    // Draw the high-resolution PDF image
    highResCtx.drawImage(flattenedPdfImage, 0, 0);
    
    // If there's a signature, scale and draw it on the high-res canvas with EEST-specific adjustments
    if (hasSig) {
      console.log('🔍 EESTSaveHandler: Scaling signature to high resolution with EEST adjustments...');
      
      // Get the actual internal dimensions of both canvases
      const baseCanvasInternalWidth = baseCanvas.width;
      const baseCanvasInternalHeight = baseCanvas.height;
      const drawCanvasInternalWidth = drawCanvas.width;
      const drawCanvasInternalHeight = drawCanvas.height;
      
      console.log('🔍 EESTSaveHandler: Canvas internal dimensions:', {
        baseCanvas: { width: baseCanvasInternalWidth, height: baseCanvasInternalHeight },
        drawCanvas: { width: drawCanvasInternalWidth, height: drawCanvasInternalHeight },
        flattenedPdf: { width: flattenedPdfImage.width, height: flattenedPdfImage.height }
      });
      
      // Check if the canvas dimensions match
      const dimensionsMatch = baseCanvasInternalWidth === drawCanvasInternalWidth && 
                             baseCanvasInternalHeight === drawCanvasInternalHeight;
      console.log('🔍 EESTSaveHandler: Canvas dimensions match:', dimensionsMatch);
      
      if (!dimensionsMatch) {
        console.warn('🔍 EESTSaveHandler: Canvas dimension mismatch detected!', {
          baseCanvas: { width: baseCanvasInternalWidth, height: baseCanvasInternalHeight },
          drawCanvas: { width: drawCanvasInternalWidth, height: drawCanvasInternalHeight }
        });
      }
      
      // Debug: Check the signature content on the drawing canvas
      const drawCtx = drawCanvas.getContext('2d');
      let minX = drawCanvas.width, maxX = 0, minY = drawCanvas.height, maxY = 0;
      
      if (drawCtx) {
        const imageData = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
        const data = imageData.data;
        
        // Find the bounds of the signature
        for (let y = 0; y < drawCanvas.height; y++) {
          for (let x = 0; x < drawCanvas.width; x++) {
            const index = (y * drawCanvas.width + x) * 4;
            if (data[index + 3] > 0) { // Alpha channel > 0
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
            }
          }
        }
        
        console.log('🔍 EESTSaveHandler: Signature bounds on drawing canvas:', {
          minX, maxX, minY, maxY,
          width: maxX - minX,
          height: maxY - minY,
          canvasWidth: drawCanvas.width,
          canvasHeight: drawCanvas.height
        });
      }
      
      // Calculate scale factors from base canvas internal size to flattened PDF size
      const scaleX = flattenedPdfImage.width / baseCanvasInternalWidth;
      const scaleY = flattenedPdfImage.height / baseCanvasInternalHeight;
      
      console.log('🔍 EESTSaveHandler: Signature scale factors:', { scaleX, scaleY });
      
      // Draw the signature using its internal dimensions, scaled to match the flattened PDF
      if (minX !== drawCanvas.width && maxX !== 0 && minY !== drawCanvas.height && maxY !== 0) {
        // Calculate the signature bounds in the high-resolution coordinate system
        const sigWidth = maxX - minX;
        const sigHeight = maxY - minY;
        
        // Detect mobile devices and iPads for coordinate adjustment
        // Improved detection that handles modern iPads (iPadOS 13+ reports as Mac)
        const userAgent = navigator.userAgent;
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const isIPadUA = /iPad/.test(userAgent);
        // Modern iPads report as Mac but have touch support and specific screen characteristics
        const isMacOS = /Macintosh|Mac OS X/.test(userAgent);
        const isModernIPad = isMacOS && isTouchDevice && !(window as any).MSStream && 
                            (window.screen.width >= 768 || window.screen.height >= 1024);
        const isIPad = isIPadUA || isModernIPad;
        const isMobile = window.innerWidth <= 768 || 
                        /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) ||
                        isIPad;
        
        // EEST-specific signature position adjustments
        const EEST_SIGNATURE_ADJUSTMENTS = {
          // Horizontal adjustments (X-axis) - EEST forms may need different positioning
          horizontal: {
            ipad: 0,        // iPad horizontal adjustment for EEST
            mobile: 900,      // General mobile horizontal adjustment for EEST
            desktop: 0      // Desktop horizontal adjustment for EEST
          },
          // Vertical adjustments (Y-axis) - EEST forms may need different positioning
          vertical: {
            ipad: 0,        // iPad vertical adjustment for EEST
            mobile: 900,      // General mobile vertical adjustment for EEST
            desktop: 0      // Desktop vertical adjustment for EEST
          }
        };
        
        // Apply EEST-specific adjustments
        let adjustedMinX = minX;
        let adjustedMinY = minY;
        
        if (isMobile) {
          let horizontalAdjustment;
          let verticalAdjustment;
          
          if (isIPad) {
            // iPad-specific adjustments for EEST
            horizontalAdjustment = EEST_SIGNATURE_ADJUSTMENTS.horizontal.ipad;
            verticalAdjustment = EEST_SIGNATURE_ADJUSTMENTS.vertical.ipad;
          } else {
            // General mobile device adjustments for EEST
            horizontalAdjustment = EEST_SIGNATURE_ADJUSTMENTS.horizontal.mobile;
            verticalAdjustment = EEST_SIGNATURE_ADJUSTMENTS.vertical.mobile;
          }
          
          adjustedMinX = Math.max(0, minX - horizontalAdjustment);
          adjustedMinY = Math.max(0, minY - verticalAdjustment);
          
          console.log('🔍 EESTSaveHandler: EEST mobile device detected, applying signature adjustments:', {
            isIPad,
            isModernIPad: isModernIPad,
            isTouchDevice,
            userAgent: userAgent.substring(0, 100),
            screenSize: { width: window.screen.width, height: window.screen.height },
            windowSize: { width: window.innerWidth, height: window.innerHeight },
            originalPosition: { minX, minY },
            adjustedPosition: { minX: adjustedMinX, minY: adjustedMinY },
            adjustments: { horizontal: horizontalAdjustment, vertical: verticalAdjustment }
          });
        } else {
          // Desktop adjustments for EEST (currently 0, but can be modified)
          const horizontalAdjustment = EEST_SIGNATURE_ADJUSTMENTS.horizontal.desktop;
          const verticalAdjustment = EEST_SIGNATURE_ADJUSTMENTS.vertical.desktop;
          
          adjustedMinX = Math.max(0, minX - horizontalAdjustment);
          adjustedMinY = Math.max(0, minY - verticalAdjustment);
          
          console.log('🔍 EESTSaveHandler: EEST desktop device detected, applying signature adjustments:', {
            isMobile: false,
            isIPad: false,
            userAgent: userAgent.substring(0, 100),
            screenSize: { width: window.screen.width, height: window.screen.height },
            windowSize: { width: window.innerWidth, height: window.innerHeight },
            originalPosition: { minX, minY },
            adjustedPosition: { minX: adjustedMinX, minY: adjustedMinY },
            adjustments: { horizontal: horizontalAdjustment, vertical: verticalAdjustment }
          });
        }
        
        const scaledMinX = adjustedMinX * scaleX;
        const scaledMinY = adjustedMinY * scaleY;
        const scaledSigWidth = sigWidth * scaleX;
        const scaledSigHeight = sigHeight * scaleY;
        
        console.log('🔍 EESTSaveHandler: Drawing EEST signature at scaled position:', {
          isIPad,
          originalBounds: { minX, minY, width: sigWidth, height: sigHeight },
          adjustedBounds: { minX: adjustedMinX, minY: adjustedMinY, width: sigWidth, height: sigHeight },
          scaledBounds: { x: scaledMinX, y: scaledMinY, width: scaledSigWidth, height: scaledSigHeight },
          scaleFactors: { scaleX, scaleY }
        });
        
        // Draw only the signature area, scaled to high resolution
        highResCtx.drawImage(
          drawCanvas,
          minX, minY, sigWidth, sigHeight,  // Source: signature area only (use original bounds)
          scaledMinX, scaledMinY, scaledSigWidth, scaledSigHeight  // Destination: adjusted scaled signature area
        );
      } else {
        // Fallback: draw the entire canvas if bounds detection failed
        console.warn('🔍 EESTSaveHandler: Signature bounds detection failed, drawing entire canvas');
        highResCtx.drawImage(
          drawCanvas, 
          0, 0, drawCanvasInternalWidth, drawCanvasInternalHeight,  // Source: full internal canvas
          0, 0, flattenedPdfImage.width, flattenedPdfImage.height  // Destination: full flattened PDF size
        );
      }
    }
    
    // Use the high-resolution combined canvas for the flattened PDF
    console.log('🔍 EESTSaveHandler: Using high-resolution combined canvas for flattened PDF...');
    const flattenedPdfBytes = await createFlattenedPDF(highResCanvas, null, null);
    const flattenedPdfBlob = new Blob([flattenedPdfBytes], { type: 'application/pdf' });
    
    console.log('🔍 EESTSaveHandler: Flattened EEST PDF created successfully');

    // Save the flattened PDF
    onSave(flattenedPdfBlob, previewImage);

    // Auto-detect form type as EEST
    const enhancedOptions = { ...options, formType: FormType.EEST };

    // Generate filename using EEST naming schema
    const filename = generateEESTFilename(enhancedOptions, true);
    
    // Save PDF metadata to database
    await saveEESTPDFMetadataToDatabase(enhancedOptions, filename, flattenedPdfBlob.size, true);

    // Download the flattened PDF
    await downloadEESTPDF(flattenedPdfBlob, {
      ...enhancedOptions,
      filename
    });

  } catch (error) {
    console.error('Error saving EEST PDF with signature:', error);
    throw new Error('Failed to save EEST PDF with signature');
  }
}

/**
 * Handles downloading an EEST PDF
 */
export async function downloadEESTPDF(
  pdfBlob: Blob,
  options: EESTSaveOptions = {}
): Promise<void> {
  try {
    // Detect iOS devices
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    
    // Generate filename using EEST naming schema
    const filename = generateEESTFilename(options, false);
    
    console.log('🔍 EESTSaveHandler: Downloading EEST PDF with filename:', filename);
    console.log('🔍 EESTSaveHandler: Device info:', { isIOS, isSafari, userAgent: navigator.userAgent });
    
    if (isIOS && isSafari) {
      // iOS Safari specific handling
      console.log('🔍 EESTSaveHandler: Using iOS Safari download method for EEST');
      
      // Create a URL for the PDF blob
      const url = URL.createObjectURL(pdfBlob);
      
      // For iOS Safari, we need to open in a new window/tab
      const newWindow = window.open(url, '_blank');
      
      if (newWindow) {
        // Set the window title to the filename
        newWindow.document.title = filename;
        
        // Clean up the URL after a delay
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 1000);
      } else {
        // Fallback: create a link and try to download
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.target = '_blank';
        
        // Add to DOM temporarily
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 1000);
      }
    } else {
      // Standard download method for other browsers
      console.log('🔍 EESTSaveHandler: Using standard download method for EEST');
      
      // Create a URL for the PDF blob
      const url = URL.createObjectURL(pdfBlob);
      
      // Create a temporary link element
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      
      // Trigger the download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the URL
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('Error downloading EEST PDF:', error);
    throw new Error('Failed to download EEST PDF');
  }
}

/**
 * Handles downloading the original EEST PDF without flattening
 */
export async function downloadOriginalEESTPDF(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  options: EESTSaveOptions = {}
): Promise<void> {
  try {
    // Use the provided PDF document (already filled by PDFLib)
    let populatedPdfDoc = pdfDoc;
    console.log('🔍 EESTSaveHandler: Using already-filled original PDF from PDFLib');

    // Get the current PDF data
    const pdfBytes = await populatedPdfDoc.getData();
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    
    // Generate filename using EEST naming schema
    const filename = generateEESTFilename(options, false);
    
    // Save PDF metadata to database
    await saveEESTPDFMetadataToDatabase(options, filename, pdfBlob.size, false);

    await downloadEESTPDF(pdfBlob, {
      ...options,
      filename
    });
  } catch (error) {
    console.error('Error downloading original EEST PDF:', error);
    throw new Error('Failed to download original EEST PDF');
  }
}

/**
 * Generates a filename using the EEST naming schema
 */
function generateEESTFilename(options: EESTSaveOptions, isSigned: boolean): string {
  // If a custom filename is provided, use it
  if (options.filename) {
    return options.filename;
  }

  // Use EEST-specific naming schema
  const exportInfo: ExportInfo = {
    date: options.date || new Date().toISOString().split('T')[0],
    incidentName: options.incidentName || options.crewInfo?.incidentName || 'Unknown',
    incidentNumber: options.incidentNumber || options.crewInfo?.incidentNumber || 'Unknown',
    contractorAgencyName: options.contractorAgencyName || options.crewInfo?.contractorAgencyName || 'Unknown',
    type: 'PDF',
    formType: FormType.EEST,
    isSigned
  };
  
  return generateExportFilename(exportInfo);
}

/**
 * Saves EEST PDF generation metadata to the database
 */
async function saveEESTPDFMetadataToDatabase(
  options: EESTSaveOptions, 
  filename: string, 
  fileSize: number, 
  isSigned: boolean
): Promise<void> {
  try {
    const metadata: PDFGenerationMetadata = {
      formType: FormType.EEST,
      incidentName: options.incidentName || options.crewInfo?.incidentName || 'Unknown',
      incidentNumber: options.incidentNumber || options.crewInfo?.incidentNumber || 'Unknown',
      contractorAgencyName: options.contractorAgencyName || options.crewInfo?.contractorAgencyName || 'Unknown',
      dateGenerated: options.date || new Date().toISOString().split('T')[0],
      filename,
      fileSize,
      isSigned,
      createdAt: Date.now()
    };

    await savePDFMetadata(metadata);
    console.log('EESTSaveHandler: EEST PDF metadata saved to database:', metadata);
  } catch (error) {
    console.error('EESTSaveHandler: Error saving EEST PDF metadata:', error);
    // Don't throw error - metadata saving failure shouldn't prevent PDF download
  }
}

/**
 * Populates EEST PDF with form data using the field mapper
 */
export async function populateEESTPDFWithFormData(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  formData: EESTFormData,
  timeEntries: EESTTimeEntry[]
): Promise<pdfjsLib.PDFDocumentProxy> {
  try {
    console.log('🔍 EESTSaveHandler: Populating EEST PDF with form data...');
    
    // Map form data to PDF fields
    const pdfFields = mapEESTToPDFFields(formData, timeEntries);
    
    console.log('🔍 EESTSaveHandler: Mapped PDF fields:', pdfFields);
    
    // Note: Form field mapping is disabled for pdfjs-dist documents
    // This would require a pdf-lib document to access form fields
    // const form = await pdfDoc.getForm();
    // debugPDFFields(form);
    // debugEESTFieldMapping(pdfFields, form);
    
    // Note: Form field population is disabled for pdfjs-dist documents
    // This would require a pdf-lib document to access and modify form fields
    // let successCount = 0;
    // let errorCount = 0;
    
    // for (const [fieldName, value] of Object.entries(pdfFields)) {
    //   try {
    //     const field = form.getField(fieldName);
    //     if (field) {
    //       // Form field population code commented out for pdfjs-dist compatibility
    //     }
    //   } catch (fieldError) {
    //     // Error handling commented out
    //   }
    // }
    
    console.log('🔍 EESTSaveHandler: Form field population skipped for pdfjs-dist document');
    return pdfDoc;
    
  } catch (error) {
    console.error('EESTSaveHandler: Error populating EEST PDF with form data:', error);
    throw new Error('Failed to populate EEST PDF with form data');
  }
}

/**
 * Test function to populate PDF form fields and return the populated PDF as blob
 * Useful for testing field mapping without saving
 */
export async function testEESTPDFPopulation(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  formData: EESTFormData,
  timeEntries: EESTTimeEntry[]
): Promise<Blob> {
  try {
    console.log('🔍 EESTSaveHandler: Testing EEST PDF population...');
    
    // Populate the PDF with form data
    const populatedPdfDoc = await populateEESTPDFWithFormData(pdfDoc, formData, timeEntries);
    
    // Get the populated PDF data
    const pdfBytes = await populatedPdfDoc.getData();
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    
    console.log('🔍 EESTSaveHandler: Test PDF population completed successfully');
    return pdfBlob;
    
  } catch (error) {
    console.error('EESTSaveHandler: Error testing EEST PDF population:', error);
    throw new Error('Failed to test EEST PDF population');
  }
}
