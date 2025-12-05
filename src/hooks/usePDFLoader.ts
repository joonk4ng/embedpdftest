import { useState, useEffect, useRef } from 'react';
import { getPDF, updateFormData, updateTimeEntries, updateCheckboxStates } from '../utils/pdfStorage';
import * as pdfjsLib from 'pdfjs-dist';
import * as PDFLib from 'pdf-lib';
import { 
  loadFederalFormData, 
  loadAllFederalEquipmentEntries, 
  loadAllFederalPersonnelEntries 
} from '../utils/engineTimeDB';
import { mapFederalToPDFFields } from '../utils/fieldmapper/federalFieldMapper';
import { createPluginRegistration } from '@embedpdf/core';
import { LoaderPluginPackage } from '@embedpdf/plugin-loader/react';
import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/react';
import { ScrollPluginPackage } from '@embedpdf/plugin-scroll/react';
import { RenderPluginPackage } from '@embedpdf/plugin-render/react';
import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/react';
import { SelectionPluginPackage } from '@embedpdf/plugin-selection/react';
import { AnnotationPluginPackage } from '@embedpdf/plugin-annotation/react';
import { ZoomPluginPackage, ZoomMode } from '@embedpdf/plugin-zoom/react';
import { ExportPluginPackage } from '@embedpdf/plugin-export/react';
import { logTrace } from '../utils/signingSystemDebug';

export interface UsePDFLoaderResult {
  pdfUrl: string | null;
  plugins: any[];
  isLoading: boolean;
  error: string | null;
  pdfDocRef: React.RefObject<pdfjsLib.PDFDocumentProxy | null>;
}

export const usePDFLoader = (
  pdfId?: string, 
  pdfBlob?: Blob,
  date?: string
): UsePDFLoaderResult => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [plugins, setPlugins] = useState<any[]>([]);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const pdfUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Validate that either pdfId or pdfBlob is provided
    if (!pdfId && !pdfBlob) {
      setError('Either pdfId or pdfBlob must be provided');
      setIsLoading(false);
      return;
    }

    let mounted = true;
    let currentPdfUrl: string | null = null;

    const loadPDF = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Determine the effective PDF ID for the loader
        const effectivePdfId = pdfId || 'federal-form-temp';
        
        logTrace('USEPDFLOADER_START', {
          pdfId,
          effectivePdfId,
          hasPdfBlob: !!pdfBlob,
          date
        });

        let pdfBlobToUse: Blob;
        let shouldFillForm = false;

        // If pdfBlob prop is provided, use it directly (assume it's already filled)
        if (pdfBlob) {
          console.log('🔍 usePDFLoader: Using provided PDF blob, size:', pdfBlob.size);
          logTrace('USEPDFLOADER_USING_BLOB', {
            pdfId,
            blobSize: pdfBlob.size,
            blobType: pdfBlob.type
          });
          pdfBlobToUse = pdfBlob;
          shouldFillForm = false; // Skip form filling when blob is provided
        } else if (pdfId) {
          // Load from IndexedDB storage
          logTrace('USEPDFLOADER_LOADING_FROM_STORAGE', { pdfId });
          const storedPDF = await getPDF(pdfId);
          if (!storedPDF) {
            logTrace('USEPDFLOADER_STORAGE_NOT_FOUND', { pdfId });
            throw new Error('PDF not found in storage');
          }
          logTrace('USEPDFLOADER_STORAGE_FOUND', {
            pdfId,
            pdfSize: storedPDF.pdf.size,
            hasPreview: !!storedPDF.preview,
            metadata: storedPDF.metadata
          });
          pdfBlobToUse = storedPDF.pdf;
          
          // Verify the PDF is actually filled by checking with pdf-lib
          // Create a copy of the blob to avoid consuming it
          const verifyBlob = pdfBlobToUse.slice(0);
          try {
            const testPdfDoc = await PDFLib.PDFDocument.load(await verifyBlob.arrayBuffer());
            const testForm = testPdfDoc.getForm();
            const testFields = testForm.getFields();
            let filledCount = 0;
            const filledFields: string[] = [];
            testFields.forEach(field => {
              try {
                const fieldName = field.getName();
                if (field.constructor.name === 'PDFTextField') {
                  const text = (field as any).getText();
                  if (text && text.trim().length > 0) {
                    filledCount++;
                    filledFields.push(`${fieldName}="${text}"`);
                  }
                } else if (field.constructor.name === 'PDFCheckBox') {
                  if ((field as any).isChecked()) {
                    filledCount++;
                    filledFields.push(`${fieldName}=checked`);
                  }
                }
              } catch (e) {
                // Ignore field errors
              }
            });
            console.log(`🔍 usePDFLoader: PDF from IndexedDB has ${filledCount} filled fields out of ${testFields.length} total fields`);
            if (filledCount > 0) {
              console.log('✅ usePDFLoader: PDF from IndexedDB is FILLED. Sample filled fields:', filledFields.slice(0, 5));
            } else if (testFields.length > 0) {
              console.error('❌ usePDFLoader: PDF from IndexedDB appears to be UNFILLED! This is the original template.');
              console.error('❌ usePDFLoader: This means the PDF generation did not work correctly.');
            }
          } catch (verifyError) {
            console.warn('⚠️ usePDFLoader: Could not verify if PDF is filled:', verifyError);
          }
          
          // PDFs stored in IndexedDB by usePDFGeneration are already filled
          // Skip reloading with pdf-lib to avoid corrupting the blob
          shouldFillForm = false;
          console.log('🔍 usePDFLoader: Loaded PDF from IndexedDB, size:', pdfBlobToUse.size, '(assuming already filled)');
        } else {
          throw new Error('Either pdfId or pdfBlob must be provided');
        }

        // Validate the PDF blob before proceeding
        if (!pdfBlobToUse || pdfBlobToUse.size === 0) {
          logTrace('USEPDFLOADER_BLOB_INVALID', {
            pdfId,
            blobSize: pdfBlobToUse?.size || 0
          });
          throw new Error('PDF blob is empty or invalid');
        }
        
        logTrace('USEPDFLOADER_BLOB_VALID', {
          pdfId,
          blobSize: pdfBlobToUse.size,
          blobType: pdfBlobToUse.type
        });

        // Read the ArrayBuffer once and reuse it to avoid consuming the blob
        // This is important because some blob types can only be read once
        console.log('🔍 usePDFLoader: Reading PDF blob ArrayBuffer (size:', pdfBlobToUse.size, 'bytes)...');
        const pdfArrayBufferOriginal = await pdfBlobToUse.arrayBuffer();
        console.log('✅ usePDFLoader: PDF ArrayBuffer read successfully, size:', pdfArrayBufferOriginal.byteLength, 'bytes');
        
        // Create a defensive copy of the ArrayBuffer to prevent it from being consumed
        // This ensures we always have a valid reference to the PDF data
        const pdfArrayBuffer = pdfArrayBufferOriginal.slice(0);
        console.log('✅ usePDFLoader: Created defensive copy of ArrayBuffer, size:', pdfArrayBuffer.byteLength, 'bytes');
        
        if (pdfArrayBuffer.byteLength === 0) {
          throw new Error('PDF ArrayBuffer is empty - blob may have been consumed or corrupted');
        }

        // Verify PDF header to ensure blob is valid
        try {
          const testBytes = new Uint8Array(pdfArrayBuffer.slice(0, 4));
          const pdfHeader = String.fromCharCode(...testBytes);
          if (pdfHeader !== '%PDF') {
            console.error('❌ usePDFLoader: PDF blob does not start with %PDF header:', pdfHeader);
            throw new Error('Invalid PDF format: blob does not contain valid PDF header');
          }
          console.log('✅ usePDFLoader: PDF blob header verified:', pdfHeader);
        } catch (headerError) {
          if (headerError instanceof Error && headerError.message.includes('Invalid PDF format')) {
            throw headerError;
          }
          console.warn('⚠️ usePDFLoader: Could not verify PDF header:', headerError);
        }

        // Start with the blob recreated from ArrayBuffer
        let finalPdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
        console.log('✅ usePDFLoader: Created fresh PDF blob from ArrayBuffer, size:', finalPdfBlob.size, 'bytes');
        
        console.log('🔍 usePDFLoader: Starting PDF load, initial blob size:', finalPdfBlob.size);
        
        // Only verify and potentially fill form fields when loading from pdfId
        if (shouldFillForm) {
          try {
            // Load with pdf-lib to verify form fields are filled (use the ArrayBuffer we already read)
            const pdfDoc = await PDFLib.PDFDocument.load(pdfArrayBuffer);
            const form = pdfDoc.getForm();
            const fields = form.getFields();
            
            console.log('🔍 usePDFLoader: PDF loaded, checking form fields...');
            console.log(`🔍 usePDFLoader: Found ${fields.length} form fields in PDF`);
            
            // Check if any fields have values (indicating the PDF is filled)
            let filledFieldsCount = 0;
            fields.forEach(field => {
              try {
                const fieldName = field.getName();
                if (field.constructor.name === 'PDFTextField') {
                  const text = (field as any).getText();
                  if (text && text.trim().length > 0) {
                    filledFieldsCount++;
                    console.log(`🔍 usePDFLoader: Field "${fieldName}" has value: "${text}"`);
                  }
                } else if (field.constructor.name === 'PDFCheckBox') {
                  if ((field as any).isChecked()) {
                    filledFieldsCount++;
                    console.log(`🔍 usePDFLoader: Checkbox "${fieldName}" is checked`);
                  }
                } else if (field.constructor.name === 'PDFDropdown') {
                  const selected = (field as any).getSelected();
                  if (selected && selected.length > 0) {
                    filledFieldsCount++;
                    console.log(`🔍 usePDFLoader: Dropdown "${fieldName}" has selection: "${selected[0]}"`);
                  }
                }
              } catch (fieldError) {
                // Ignore errors for individual fields
              }
            });
            
            console.log(`🔍 usePDFLoader: Found ${filledFieldsCount} filled fields out of ${fields.length} total fields`);
            
            // If the PDF has form fields but none are filled, store form data as metadata
            if (fields.length > 0 && filledFieldsCount === 0) {
              console.warn('⚠️ usePDFLoader: PDF has form fields but none appear to be filled. Storing form data as metadata overlay...');
              
              try {
                // Only process Federal forms (pdfId === 'federal-form')
                if (pdfId === 'federal-form') {
                  // Load form data from database
                  const formData = await loadFederalFormData();
                  const allEquipmentEntries = await loadAllFederalEquipmentEntries();
                  const allPersonnelEntries = await loadAllFederalPersonnelEntries();
                  
                  if (formData) {
                    // Get the date from the form data or use today's date
                    const formDate = date || new Date().toLocaleDateString();
                    
                    // Filter entries by date (if date is available)
                    const equipmentEntries = formDate 
                      ? allEquipmentEntries.filter(e => e.date === formDate)
                      : allEquipmentEntries;
                    const personnelEntries = formDate
                      ? allPersonnelEntries.filter(e => e.date === formDate)
                      : allPersonnelEntries;
                    
                    // Get checkbox states from form data
                    const checkboxStates = formData.checkboxStates || {
                      noMealsLodging: false,
                      noMeals: false,
                      travel: false,
                      noLunch: false,
                      hotline: true
                    };
                    
                    // Map form data to PDF fields
                    const pdfFields = mapFederalToPDFFields(
                      formData,
                      equipmentEntries,
                      personnelEntries,
                      checkboxStates
                    );
                    
                    console.log('🔍 usePDFLoader: Storing form data as metadata overlay (', Object.keys(pdfFields).length, 'fields)...');
                    
                    // Store form data as JSON metadata (NOT burning into PDF)
                    try {
                      await updateFormData(pdfId, {
                        fields: pdfFields,
                        formType: 'federal',
                        lastModified: new Date().toISOString()
                      });
                      console.log('✅ usePDFLoader: Form data stored as metadata overlay');
                    } catch (metadataError) {
                      console.error('⚠️ usePDFLoader: Error storing form data metadata:', metadataError);
                    }
                    
                    // Store checkbox states separately
                    try {
                      await updateCheckboxStates(pdfId, checkboxStates);
                      console.log('✅ usePDFLoader: Checkbox states stored as metadata');
                    } catch (checkboxError) {
                      console.error('⚠️ usePDFLoader: Error storing checkbox states:', checkboxError);
                    }
                    
                    // Store time entries separately
                    try {
                      await updateTimeEntries(pdfId, {
                        equipmentEntries: equipmentEntries.map(e => ({
                          id: e.id,
                          date: e.date,
                          start: e.start,
                          stop: e.stop,
                          start1: e.start1,
                          stop1: e.stop1,
                          start2: e.start2,
                          stop2: e.stop2,
                          total: e.total,
                          quantity: e.quantity,
                          type: e.type,
                          remarks: e.remarks
                        })),
                        personnelEntries: personnelEntries.map(p => ({
                          id: p.id,
                          date: p.date,
                          name: p.name,
                          start1: p.start1,
                          stop1: p.stop1,
                          start2: p.start2,
                          stop2: p.stop2,
                          total: p.total,
                          remarks: p.remarks
                        }))
                      });
                      console.log('✅ usePDFLoader: Time entries stored as metadata');
                    } catch (timeEntryError) {
                      console.error('⚠️ usePDFLoader: Error storing time entries:', timeEntryError);
                      }
                    
                    filledFieldsCount = Object.keys(pdfFields).length;
                    console.log(`✅ usePDFLoader: Metadata overlay stored (${filledFieldsCount} fields). PDF binary remains unchanged.`);
                  } else {
                    console.warn('⚠️ usePDFLoader: No form data found in database to store as metadata');
                  }
                }
              } catch (metadataError) {
                console.error('⚠️ usePDFLoader: Error storing form data as metadata:', metadataError);
                // Continue with unfilled PDF if metadata storage fails
              }
            }
            
            // Keep PDF binary unchanged - don't save modifications
            // Form data is now stored as metadata overlay, not burned into PDF
            console.log('🔍 usePDFLoader: Using original PDF binary (form data stored as metadata overlay)');
          } catch (pdfLibError) {
            console.warn('🔍 usePDFLoader: Could not verify form fields with pdf-lib, continuing anyway:', pdfLibError);
            // Continue with the PDF blob we already created
          }
        } else {
          // When pdfBlob prop is provided or loading from IndexedDB, skip form verification/filling
          // PDFs from IndexedDB are already filled by usePDFGeneration
          console.log('🔍 usePDFLoader: Using PDF blob directly (skipping form verification - already filled)');
        }

        // Final validation before creating URL
        if (!finalPdfBlob || finalPdfBlob.size === 0) {
          throw new Error('PDF blob is empty or invalid after processing');
        }
        
        // Validate PDF blob type
        if (finalPdfBlob.type && finalPdfBlob.type !== 'application/pdf') {
          console.warn('⚠️ usePDFLoader: PDF blob type is not application/pdf:', finalPdfBlob.type);
          // Set correct MIME type if missing
          if (!finalPdfBlob.type) {
            finalPdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
            console.log('🔍 usePDFLoader: Set PDF blob MIME type to application/pdf');
          }
        }
        
        console.log('🔍 usePDFLoader: Final PDF blob before creating URL, size:', finalPdfBlob.size, 'type:', finalPdfBlob.type);
        console.log('🔍 usePDFLoader: Creating blob URL for PDF...');
        
        // Create a fresh blob URL (revoke old one if it exists to prevent caching issues)
        if (currentPdfUrl) {
          URL.revokeObjectURL(currentPdfUrl);
        }
        const url = URL.createObjectURL(finalPdfBlob);
        currentPdfUrl = url;
        pdfUrlRef.current = url;
        
        logTrace('USEPDFLOADER_BLOB_URL_CREATED', {
          pdfId,
          blobUrl: url.substring(0, 50) + '...',
          blobSize: finalPdfBlob.size
        });
        
        console.log('🔍 usePDFLoader: Created new blob URL:', url, '(old URL revoked if existed)');
        
        console.log('🔍 usePDFLoader: Blob URL created:', url);
        console.log('🔍 usePDFLoader: Testing blob URL accessibility...');
        
        // Test if the blob URL is accessible
        try {
          const testResponse = await fetch(url);
          if (!testResponse.ok) {
            logTrace('USEPDFLOADER_BLOB_URL_INACCESSIBLE', {
              pdfId,
              status: testResponse.status,
              statusText: testResponse.statusText
            });
            throw new Error(`Blob URL fetch failed: ${testResponse.status} ${testResponse.statusText}`);
          }
          const testBlob = await testResponse.blob();
          logTrace('USEPDFLOADER_BLOB_URL_ACCESSIBLE', {
            pdfId,
            fetchedSize: testBlob.size
          });
          console.log('✅ usePDFLoader: Blob URL is accessible, fetched size:', testBlob.size);
        } catch (fetchError) {
          logTrace('USEPDFLOADER_BLOB_URL_ERROR', {
            pdfId,
            error: fetchError instanceof Error ? fetchError.message : String(fetchError)
          });
          console.error('❌ usePDFLoader: Blob URL is not accessible:', fetchError);
          throw new Error(`Blob URL is not accessible: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
        }
        
        if (!mounted) {
          URL.revokeObjectURL(url);
          return;
        }

        setPdfUrl(url);
        console.log('🔍 usePDFLoader: PDF URL set, ready to load into EmbedPDF');

        // Load PDF.js document for saving functionality using the ArrayBuffer we already read
        // Create a copy of the ArrayBuffer for PDF.js to prevent any potential consumption
        const pdfArrayBufferForPdfJs = pdfArrayBuffer.slice(0);
        console.log('🔍 usePDFLoader: Loading PDF.js document from ArrayBuffer (size:', pdfArrayBufferForPdfJs.byteLength, 'bytes)...');
        const loadingTask = pdfjsLib.getDocument({ 
          data: pdfArrayBufferForPdfJs,
          useSystemFonts: true,
          disableFontFace: false,
        });
        const pdfDoc = await loadingTask.promise;
        pdfDocRef.current = pdfDoc;
        console.log('✅ usePDFLoader: PDF.js document loaded successfully, pages:', pdfDoc.numPages);
        
        // Verify the original ArrayBuffer is still intact after PDF.js loading
        console.log('🔍 usePDFLoader: Verifying original ArrayBuffer after PDF.js load, size:', pdfArrayBuffer.byteLength, 'bytes');
        if (pdfArrayBuffer.byteLength === 0) {
          console.error('❌ usePDFLoader: Original ArrayBuffer was consumed! This should not happen.');
          throw new Error('PDF ArrayBuffer was consumed during PDF.js loading');
        }

        // Create plugins with the PDF URL
        // Note: Using URL type as it's the most reliable for EmbedPDF
        // The blob URL has been validated and is accessible
        console.log('🔍 usePDFLoader: Creating plugins with URL:', url, 'ID:', effectivePdfId);
        console.log('🔍 usePDFLoader: Original PDF ArrayBuffer size (for reference):', pdfArrayBuffer.byteLength, 'bytes');
        const pdfPlugins = [
          createPluginRegistration(LoaderPluginPackage, {
            loadingOptions: {
              type: 'url',
              pdfFile: {
                id: effectivePdfId,
                url: url,
              },
            },
          }),
          createPluginRegistration(ViewportPluginPackage),
          createPluginRegistration(ScrollPluginPackage),
          createPluginRegistration(RenderPluginPackage),
          createPluginRegistration(InteractionManagerPluginPackage),
          createPluginRegistration(SelectionPluginPackage),
          createPluginRegistration(AnnotationPluginPackage, {
            autoCommit: true, // Automatically commit annotations to the PDF document
          }),
          createPluginRegistration(ZoomPluginPackage, {
            defaultZoomLevel: ZoomMode.FitPage,
          }),
          createPluginRegistration(ExportPluginPackage, {
            defaultFileName: effectivePdfId ? `${effectivePdfId}.pdf` : 'federal-form.pdf',
          }),
        ];
        
        setPlugins(pdfPlugins);
        logTrace('USEPDFLOADER_PLUGINS_CREATED', {
          pdfId,
          pluginsCount: pdfPlugins.length,
          blobUrl: url.substring(0, 50) + '...'
        });
        console.log('✅ usePDFLoader: Plugins created and set, count:', pdfPlugins.length);
        // Log the loader plugin configuration in detail
        const loaderPlugin = pdfPlugins[0];
        console.log('✅ usePDFLoader: Loader plugin full structure:', JSON.stringify(loaderPlugin, (_key, value) => {
          // Skip circular references and functions
          if (typeof value === 'function') return '[Function]';
          if (value instanceof Error) return value.message;
          return value;
        }, 2));
        
        // Try to access configuration in different ways
        const config1 = (loaderPlugin as any)?.config;
        const config2 = (loaderPlugin as any)?.options;
        const config3 = (loaderPlugin as any)?.pluginConfig;
        console.log('✅ usePDFLoader: Config access attempts:', {
          hasConfig: !!config1,
          hasOptions: !!config2,
          hasPluginConfig: !!config3,
          config1: config1,
          config2: config2,
          config3: config3
        });
        setIsLoading(false);
        logTrace('USEPDFLOADER_COMPLETE', {
          pdfId,
          pdfUrl: url.substring(0, 50) + '...',
          pluginsCount: pdfPlugins.length
        });
        console.log('✅ usePDFLoader: Loading state set to false, PDF should render now');
      } catch (err) {
        logTrace('USEPDFLOADER_ERROR', {
          pdfId,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined
        });
        console.error('❌ usePDFLoader: Error loading PDF:', err);
        console.error('❌ usePDFLoader: Error stack:', err instanceof Error ? err.stack : 'No stack trace');
        if (mounted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to load PDF';
          setError(errorMessage);
          setIsLoading(false);
          console.error('❌ usePDFLoader: Error state set:', errorMessage);
        }
      }
    };

    loadPDF();

    return () => {
      mounted = false;
      if (currentPdfUrl) {
        URL.revokeObjectURL(currentPdfUrl);
      }
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
      }
    };
  }, [pdfId, pdfBlob, date]);

  return {
    pdfUrl,
    plugins,
    isLoading,
    error,
    pdfDocRef
  };
};

