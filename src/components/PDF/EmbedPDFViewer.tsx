// EmbedPDF-based PDF Viewer
import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { getPDF } from '../../utils/pdfStorage';
import { DrawingCanvas, type DrawingCanvasRef } from './DrawingCanvas';
import { downloadOriginalPDF } from '../../utils/PDF/pdfSaveHandler';
import * as pdfjsLib from 'pdfjs-dist';
import * as PDFLib from 'pdf-lib';
import { 
  loadFederalFormData, 
  loadAllFederalEquipmentEntries, 
  loadAllFederalPersonnelEntries 
} from '../../utils/engineTimeDB';
import { mapFederalToPDFFields } from '../../utils/fieldmapper/federalFieldMapper';
import '../../styles/components/EmbedPDFViewer.css';

// EmbedPDF imports
import { createPluginRegistration } from '@embedpdf/core';
import { EmbedPDF } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';
import { Viewport, ViewportPluginPackage } from '@embedpdf/plugin-viewport/react';
import { Scroller, ScrollPluginPackage } from '@embedpdf/plugin-scroll/react';
import { LoaderPluginPackage } from '@embedpdf/plugin-loader/react';
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react';
import { ZoomPluginPackage, ZoomMode, useZoom } from '@embedpdf/plugin-zoom/react';
import { InteractionManagerPluginPackage, PagePointerProvider } from '@embedpdf/plugin-interaction-manager/react';
import { AnnotationPluginPackage, AnnotationLayer, useAnnotation, useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { SelectionPluginPackage } from '@embedpdf/plugin-selection/react';
import { ExportPluginPackage, useExportCapability } from '@embedpdf/plugin-export/react';

export interface EmbedPDFViewerProps {
  pdfId?: string;
  pdfBlob?: Blob;
  onSave?: (pdfData: Blob, previewImage: Blob) => void;
  onBeforeSign?: () => Promise<void>;
  className?: string;
  style?: React.CSSProperties;
  readOnly?: boolean;
  crewInfo?: {
    crewNumber: string;
    fireName: string;
    fireNumber: string;
  };
  date?: string;
}

export interface EmbedPDFViewerRef {
  handleSave: () => void;
  handleDownload: () => void;
  isDrawingMode: boolean;
  toggleDrawingMode: () => void;
  clearDrawing: () => void;
  setZoom: (zoomLevel: number) => void;
  getCurrentZoom: () => number;
}

export const EmbedPDFViewer = forwardRef<EmbedPDFViewerRef, EmbedPDFViewerProps>(({
  pdfId,
  pdfBlob,
  onSave,
  onBeforeSign,
  className,
  style,
  readOnly = false,
  crewInfo,
  date
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingCanvasRef = useRef<DrawingCanvasRef>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const pdfUrlRef = useRef<string | null>(null);
  const viewportWrapperRef = useRef<HTMLDivElement | null>(null);
  const embedPdfEngineRef = useRef<any>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [plugins, setPlugins] = useState<any[]>([]);

  // Initialize EmbedPDF engine
  const { engine, isLoading: engineLoading } = usePdfiumEngine();
  
  // Store engine reference for saving
  useEffect(() => {
    if (engine) {
      embedPdfEngineRef.current = engine;
    }
  }, [engine]);
  
  // Annotation controls ref (will be set by AnnotationControls component)
  const annotationControlsRef = useRef<{ 
    toggleInk: () => void; 
    clearAnnotations: () => void; 
    isInkMode: boolean;
    getAnnotations: () => any;
    exportPDF: () => Promise<Blob | null>;
  } | null>(null);

  // Load PDF and create blob URL
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

        let pdfBlobToUse: Blob;
        let shouldFillForm = false;

        // If pdfBlob prop is provided, use it directly (assume it's already filled)
        if (pdfBlob) {
          console.log('🔍 EmbedPDFViewer: Using provided PDF blob, size:', pdfBlob.size);
          pdfBlobToUse = pdfBlob;
          shouldFillForm = false; // Skip form filling when blob is provided
        } else if (pdfId) {
          // Load from IndexedDB storage
          const storedPDF = await getPDF(pdfId);
          if (!storedPDF) {
            throw new Error('PDF not found in storage');
          }
          pdfBlobToUse = storedPDF.pdf;
          shouldFillForm = true; // May need to fill form if loading from storage
        } else {
          throw new Error('Either pdfId or pdfBlob must be provided');
        }

        // Verify the PDF has form fields and check if they're filled
        // This helps ensure we're displaying the correct filled PDF
        // Skip this step when pdfBlob prop is provided (assume it's already filled)
        let finalPdfBlob: Blob = pdfBlobToUse;
        
        console.log('🔍 EmbedPDFViewer: Starting PDF load, initial blob size:', finalPdfBlob.size);
        
        // Only verify and potentially fill form fields when loading from pdfId
        if (shouldFillForm) {
          try {
            // Load with pdf-lib to verify form fields are filled
            const pdfDoc = await PDFLib.PDFDocument.load(await pdfBlobToUse.arrayBuffer());
            const form = pdfDoc.getForm();
            const fields = form.getFields();
            
            console.log('🔍 EmbedPDFViewer: PDF loaded, checking form fields...');
            console.log(`🔍 EmbedPDFViewer: Found ${fields.length} form fields in PDF`);
            
            // Check if any fields have values (indicating the PDF is filled)
            let filledFieldsCount = 0;
            fields.forEach(field => {
              try {
                const fieldName = field.getName();
                if (field.constructor.name === 'PDFTextField') {
                  const text = (field as any).getText();
                  if (text && text.trim().length > 0) {
                    filledFieldsCount++;
                    console.log(`🔍 EmbedPDFViewer: Field "${fieldName}" has value: "${text}"`);
                  }
                } else if (field.constructor.name === 'PDFCheckBox') {
                  if ((field as any).isChecked()) {
                    filledFieldsCount++;
                    console.log(`🔍 EmbedPDFViewer: Checkbox "${fieldName}" is checked`);
                  }
                } else if (field.constructor.name === 'PDFDropdown') {
                  const selected = (field as any).getSelected();
                  if (selected && selected.length > 0) {
                    filledFieldsCount++;
                    console.log(`🔍 EmbedPDFViewer: Dropdown "${fieldName}" has selection: "${selected[0]}"`);
                  }
                }
              } catch (fieldError) {
                // Ignore errors for individual fields
              }
            });
            
            console.log(`🔍 EmbedPDFViewer: Found ${filledFieldsCount} filled fields out of ${fields.length} total fields`);
            
            // If the PDF has form fields but none are filled, fill it now
            if (fields.length > 0 && filledFieldsCount === 0) {
              console.warn('⚠️ EmbedPDFViewer: PDF has form fields but none appear to be filled. Attempting to fill PDF with data from database...');
              
              try {
                // Only fill Federal forms (pdfId === 'federal-form')
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
                    
                    console.log('🔍 EmbedPDFViewer: Filling PDF with', Object.keys(pdfFields).length, 'fields...');
                    
                    // Fill the form fields
                    let filledCount = 0;
                    Object.entries(pdfFields).forEach(([fieldName, value]) => {
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
                        console.warn(`⚠️ EmbedPDFViewer: Error filling field ${fieldName}:`, fieldError);
                      }
                    });
                    
                    console.log(`🔍 EmbedPDFViewer: Successfully filled ${filledCount} fields`);
                    
                    // Update the pdfDoc reference for flattening
                    // The form is already filled in the current pdfDoc, so we can use it directly
                    filledFieldsCount = filledCount;
                  } else {
                    console.warn('⚠️ EmbedPDFViewer: No form data found in database to fill PDF');
                  }
                }
              } catch (fillError) {
                console.error('⚠️ EmbedPDFViewer: Error filling PDF:', fillError);
                // Continue with unfilled PDF if filling fails
              }
            }
            
            // Save the PDF document if we filled it or if it was already filled
            // This ensures we have a fresh blob with the current state
            // Don't flatten - EmbedPDF should be able to display filled form fields and add annotations
            // Flattening can interfere with annotation saving, so let's try without it
            try {
              console.log('🔍 EmbedPDFViewer: Saving PDF document (filledFieldsCount:', filledFieldsCount, ')...');
              const savedBytes = await pdfDoc.save();
              // Convert Uint8Array to ArrayBuffer for Blob
              const arrayBuffer = savedBytes.buffer instanceof ArrayBuffer 
                ? savedBytes.buffer.slice(savedBytes.byteOffset, savedBytes.byteOffset + savedBytes.byteLength)
                : new Uint8Array(savedBytes).buffer;
              finalPdfBlob = new Blob([arrayBuffer], { type: 'application/pdf' });
              console.log('🔍 EmbedPDFViewer: PDF saved, new blob size:', finalPdfBlob.size, '(filledFieldsCount:', filledFieldsCount, ')');
              console.log('🔍 EmbedPDFViewer: Using PDF with form structure preserved for annotations');
            } catch (saveError) {
              console.error('⚠️ EmbedPDFViewer: Could not save PDF:', saveError);
              // Fallback to original if save fails
              finalPdfBlob = pdfBlobToUse;
            }
          } catch (pdfLibError) {
            console.warn('🔍 EmbedPDFViewer: Could not verify form fields with pdf-lib, continuing anyway:', pdfLibError);
            // Continue with the PDF even if we can't verify fields
            // Ensure finalPdfBlob is still set
            if (!finalPdfBlob) {
              finalPdfBlob = pdfBlobToUse;
            }
          }
        } else {
          // When pdfBlob prop is provided, skip form verification/filling
          console.log('🔍 EmbedPDFViewer: Using provided PDF blob directly (skipping form verification)');
        }

        // Create object URL for the PDF blob
        if (!finalPdfBlob || finalPdfBlob.size === 0) {
          throw new Error('PDF blob is empty or invalid');
        }
        
        // Validate PDF blob type
        if (finalPdfBlob.type && finalPdfBlob.type !== 'application/pdf') {
          console.warn('⚠️ EmbedPDFViewer: PDF blob type is not application/pdf:', finalPdfBlob.type);
        }
        
        console.log('🔍 EmbedPDFViewer: Final PDF blob before creating URL, size:', finalPdfBlob.size, 'type:', finalPdfBlob.type);
        console.log('🔍 EmbedPDFViewer: Creating blob URL for PDF...');
        
        // Verify the blob is valid by trying to read a small portion
        try {
          const testSlice = finalPdfBlob.slice(0, 4);
          const testArray = await testSlice.arrayBuffer();
          const testBytes = new Uint8Array(testArray);
          const pdfHeader = String.fromCharCode(...testBytes);
          if (pdfHeader !== '%PDF') {
            console.warn('⚠️ EmbedPDFViewer: PDF blob does not start with %PDF header:', pdfHeader);
          } else {
            console.log('✅ EmbedPDFViewer: PDF blob header verified:', pdfHeader);
          }
        } catch (headerError) {
          console.warn('⚠️ EmbedPDFViewer: Could not verify PDF header:', headerError);
        }
        
        const url = URL.createObjectURL(finalPdfBlob);
        currentPdfUrl = url;
        pdfUrlRef.current = url;
        
        console.log('🔍 EmbedPDFViewer: Blob URL created:', url);
        console.log('🔍 EmbedPDFViewer: Testing blob URL accessibility...');
        
        // Test if the blob URL is accessible
        try {
          const testResponse = await fetch(url);
          if (!testResponse.ok) {
            throw new Error(`Blob URL fetch failed: ${testResponse.status} ${testResponse.statusText}`);
          }
          const testBlob = await testResponse.blob();
          console.log('✅ EmbedPDFViewer: Blob URL is accessible, fetched size:', testBlob.size);
        } catch (fetchError) {
          console.error('❌ EmbedPDFViewer: Blob URL is not accessible:', fetchError);
          throw new Error(`Blob URL is not accessible: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
        }
        
        if (!mounted) {
          URL.revokeObjectURL(url);
          return;
        }

        setPdfUrl(url);
        console.log('🔍 EmbedPDFViewer: PDF URL set, ready to load into EmbedPDF');

        // Load PDF.js document for saving functionality
        const arrayBuffer = await finalPdfBlob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ 
          data: arrayBuffer,
          useSystemFonts: true,
          disableFontFace: false,
        });
        const pdfDoc = await loadingTask.promise;
        pdfDocRef.current = pdfDoc;

        // Create plugins with the PDF URL
        console.log('🔍 EmbedPDFViewer: Creating plugins with URL:', url, 'ID:', effectivePdfId);
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
        console.log('✅ EmbedPDFViewer: Plugins created and set, count:', pdfPlugins.length);
        setIsLoading(false);
        console.log('✅ EmbedPDFViewer: Loading state set to false, PDF should render now');
      } catch (err) {
        console.error('❌ EmbedPDFViewer: Error loading PDF:', err);
        console.error('❌ EmbedPDFViewer: Error stack:', err instanceof Error ? err.stack : 'No stack trace');
        if (mounted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to load PDF';
          setError(errorMessage);
          setIsLoading(false);
          console.error('❌ EmbedPDFViewer: Error state set:', errorMessage);
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

  // Toggle drawing mode (now uses EmbedPDF annotations)
  const toggleDrawingMode = useCallback(async () => {
    if (onBeforeSign && !isDrawingMode) {
      try {
        await onBeforeSign();
      } catch (error) {
        console.error('Error in onBeforeSign:', error);
        return;
      }
    }
    
    // Toggle EmbedPDF ink annotation mode
    if (annotationControlsRef.current) {
      annotationControlsRef.current.toggleInk();
      // State will be updated via callback from annotation controls
    } else {
      setIsDrawingMode(!isDrawingMode);
    }
  }, [isDrawingMode, onBeforeSign]);

  // Clear drawing (now clears EmbedPDF annotations)
  const clearDrawing = useCallback(() => {
    // Clear EmbedPDF annotations
    if (annotationControlsRef.current) {
      annotationControlsRef.current.clearAnnotations();
    }
    // Also clear the old drawing canvas if it exists (for backward compatibility)
    drawingCanvasRef.current?.clearDrawing();
  }, []);

  // Handle saving the PDF with signature (uses EmbedPDF's default save logic)
  const handleSave = useCallback(async () => {
    if (!onSave) return;

    try {
      // Use EmbedPDF's exportPDF method to get the PDF with annotations
      // This uses EmbedPDF's native saveAsCopy which preserves annotations correctly
      if (!annotationControlsRef.current?.exportPDF) {
        setError('Failed to save PDF. Annotation controls not available.');
        console.error('🔍 EmbedPDFViewer: Annotation controls not available');
        return;
      }

      console.log('🔍 EmbedPDFViewer: Exporting PDF with annotations using EmbedPDF saveAsCopy...');
      const annotatedPdfBlob = await annotationControlsRef.current.exportPDF();
      
      if (!annotatedPdfBlob) {
        setError('Failed to save PDF. Could not export PDF with annotations.');
        console.error('🔍 EmbedPDFViewer: exportPDF returned null');
        return;
      }

      console.log('🔍 EmbedPDFViewer: Successfully exported PDF with annotations from EmbedPDF');
      console.log('🔍 EmbedPDFViewer: Annotated PDF blob size:', annotatedPdfBlob.size, 'type:', annotatedPdfBlob.type);
      
      // Use the annotated PDF directly - don't flatten
      // Flattening would remove annotations, and we want to preserve both form fields and annotations
      let finalPdfBlob = annotatedPdfBlob;
      console.log('🔍 EmbedPDFViewer: Using annotated PDF as-is (form fields and annotations preserved)');
      console.log('🔍 EmbedPDFViewer: About to call onSave with finalPdfBlob, size:', finalPdfBlob.size);
      
      // Create preview image from the final PDF using PDF.js
      try {
        const pdfjsDoc = await pdfjsLib.getDocument({ data: await finalPdfBlob.arrayBuffer() }).promise;
        const pdfjsPage = await pdfjsDoc.getPage(1);
        const viewport = pdfjsPage.getViewport({ scale: 2.0 });
        
        const previewCanvas = document.createElement('canvas');
        previewCanvas.width = viewport.width;
        previewCanvas.height = viewport.height;
        const ctx = previewCanvas.getContext('2d');
        
        if (ctx) {
          await pdfjsPage.render({ canvasContext: ctx, viewport }).promise;
          const previewBlob = await new Promise<Blob>((resolve) => {
            previewCanvas.toBlob((blob) => resolve(blob || new Blob()), 'image/png');
          });
          
          // Pass the flattened PDF with annotations
          onSave(finalPdfBlob, previewBlob);
        } else {
          // If preview generation fails, still save the PDF
          console.warn('🔍 EmbedPDFViewer: Could not generate preview, saving PDF anyway');
          const emptyPreview = new Blob([], { type: 'image/png' });
          onSave(finalPdfBlob, emptyPreview);
        }
      } catch (previewError) {
        // If preview generation fails, still save the PDF
        console.warn('🔍 EmbedPDFViewer: Preview generation failed, saving PDF anyway:', previewError);
        const emptyPreview = new Blob([], { type: 'image/png' });
        onSave(finalPdfBlob, emptyPreview);
      }
    } catch (error) {
      console.error('🔍 EmbedPDFViewer: Error saving PDF:', error);
      setError(error instanceof Error ? error.message : 'Failed to save PDF');
    }
  }, [onSave]);

  // Handle downloading the original PDF
  const handleDownload = useCallback(async () => {
    if (!pdfDocRef.current) return;
    try {
      await downloadOriginalPDF(pdfDocRef.current, { crewInfo, date });
    } catch (error) {
      console.error('Error downloading PDF:', error);
      setError('Failed to download PDF.');
    }
  }, [pdfDocRef.current, crewInfo, date]);

  // Zoom control functions (will be set by ZoomControls component)
  const zoomControlsRef = useRef<{ setZoom: (level: number) => void; getZoom: () => number } | null>(null);
  
  const setZoom = useCallback((zoomLevel: number) => {
    if (zoomControlsRef.current) {
      zoomControlsRef.current.setZoom(zoomLevel);
    }
  }, []);

  const getCurrentZoom = useCallback(() => {
    if (zoomControlsRef.current) {
      return zoomControlsRef.current.getZoom();
    }
    return 1.0;
  }, []);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    handleSave,
    handleDownload,
    isDrawingMode,
    toggleDrawingMode,
    clearDrawing,
    setZoom,
    getCurrentZoom
  }));

  // Show loading state
  // Debug logging
  useEffect(() => {
    console.log('🔍 EmbedPDFViewer: Render state:', {
      engineLoading,
      isLoading,
      hasEngine: !!engine,
      hasPdfUrl: !!pdfUrl,
      pluginsCount: plugins.length,
      pdfUrl: pdfUrl,
      error: error
    });
    
    // Log when all conditions are met for rendering
    if (!engineLoading && !isLoading && engine && pdfUrl && plugins.length > 0) {
      console.log('✅ EmbedPDFViewer: All conditions met for PDF rendering');
    } else {
      console.log('⏳ EmbedPDFViewer: Waiting for conditions:', {
        waitingForEngine: engineLoading || !engine,
        waitingForLoading: isLoading,
        waitingForUrl: !pdfUrl,
        waitingForPlugins: plugins.length === 0
      });
    }
  }, [engineLoading, isLoading, engine, pdfUrl, plugins.length, error]);

  // Monitor when EmbedPDF actually renders
  useEffect(() => {
    if (!engineLoading && !isLoading && engine && pdfUrl && plugins.length > 0) {
      // Wait a bit for EmbedPDF to render
      const timer = setTimeout(() => {
        const viewportElement = viewportWrapperRef.current;
        if (viewportElement) {
          const embedPdfElements = viewportElement.querySelectorAll('[data-embedpdf], canvas, svg');
          console.log('🔍 EmbedPDFViewer: DOM check - found', embedPdfElements.length, 'EmbedPDF elements');
          
          if (embedPdfElements.length === 0) {
            console.warn('⚠️ EmbedPDFViewer: No EmbedPDF elements found in DOM - PDF may not be rendering');
          } else {
            console.log('✅ EmbedPDFViewer: EmbedPDF elements found in DOM');
            embedPdfElements.forEach((el, idx) => {
              console.log(`  Element ${idx + 1}:`, el.tagName, el.className || 'no class', {
                width: (el as HTMLElement).offsetWidth,
                height: (el as HTMLElement).offsetHeight,
                visible: (el as HTMLElement).offsetWidth > 0 && (el as HTMLElement).offsetHeight > 0
              });
            });
          }
          
          // Check container dimensions
          const containerRect = viewportElement.getBoundingClientRect();
          console.log('🔍 EmbedPDFViewer: Container dimensions:', {
            width: containerRect.width,
            height: containerRect.height,
            hasDimensions: containerRect.width > 0 && containerRect.height > 0
          });
        }
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [engineLoading, isLoading, engine, pdfUrl, plugins.length]);

  if (engineLoading || isLoading || !engine || !pdfUrl || plugins.length === 0) {
    return (
      <div 
        className={`embedpdf-viewer-wrapper ${className || ''}`} 
        style={{
          ...style,
          width: '100%',
          height: 'auto',
          minHeight: '400px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <div className="loading" style={{
          padding: '20px',
          fontSize: '16px',
          color: '#666'
        }}>
          {engineLoading ? 'Loading PDF Engine...' : 'Loading PDF...'}
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`embedpdf-viewer-wrapper ${className || ''}`} 
      style={{
        ...style,
        width: '100%',
        height: 'auto',
        minHeight: '400px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
      }}
    >
      {error && (
        <div className="error-message" style={{
          color: '#dc3545',
          padding: '10px',
          margin: '10px',
          background: '#f8d7da',
          borderRadius: '4px'
        }}>
          {error}
        </div>
      )}

      {/* PDF Container */}
      <div 
        className="embedpdf-viewer" 
        style={{
          overflow: isDrawingMode ? 'hidden' : 'visible',
          width: '100%',
          height: 'auto',
          minHeight: '400px',
          position: 'relative'
        }}
      >
        <div 
          className="pdf-container"
          ref={containerRef}
          style={{
            width: '100%',
            height: 'auto',
            minHeight: '400px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            padding: '20px 10px',
            boxSizing: 'border-box',
            margin: '0 auto'
          }}
        >
          <div 
            ref={viewportWrapperRef} 
            style={{ 
              width: '100%', 
              height: '100%',
              minHeight: '400px'
            }}
          >
            <EmbedPDF engine={engine} plugins={plugins}>
              <Viewport 
                style={{ 
                  backgroundColor: '#f1f3f5',
                  width: '100%',
                  height: '100%',
                  minHeight: '400px',
                  position: 'relative',
                  display: 'block'
                }}
              >
                <Scroller
                  renderPage={({ width, height, pageIndex, scale, rotation }) => (
                    <PagePointerProvider
                      pageIndex={pageIndex}
                      pageWidth={width}
                      pageHeight={height}
                      scale={scale}
                      rotation={rotation}
                    >
                      <div 
                        style={{ 
                          width, 
                          height,
                          position: 'relative',
                          pointerEvents: 'auto'
                        }}
                      >
                        {/* The RenderLayer is responsible for drawing the page */}
                        <RenderLayer pageIndex={pageIndex} scale={scale} />
                        {/* Annotation layer for drawing/signing - must be transparent */}
                        {/* Only render annotation layer when in drawing mode to avoid blocking touch events */}
                        {isDrawingMode && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              pointerEvents: 'auto',
                              backgroundColor: 'transparent',
                              zIndex: 1,
                              touchAction: 'none'
                            }}
                          >
                            <AnnotationLayer 
                              pageIndex={pageIndex} 
                              scale={scale} 
                              pageWidth={width}
                              pageHeight={height}
                              rotation={rotation}
                            />
                          </div>
                        )}
                      </div>
                    </PagePointerProvider>
                  )}
                />
              </Viewport>
              {/* Zoom controls component - must be inside EmbedPDF context but renders outside viewport */}
              <EmbedPDFZoomControls ref={zoomControlsRef} />
              {/* Annotation controls component - must be inside EmbedPDF context */}
              <EmbedPDFAnnotationControls ref={annotationControlsRef} onInkModeChange={setIsDrawingMode} engineRef={embedPdfEngineRef} />
            </EmbedPDF>
          </div>
        </div>
        
        {/* Old drawing canvas removed - using EmbedPDF annotations instead */}
      </div>

      {/* Action Buttons */}
      {!readOnly && (
        <div 
          style={{
            width: '100%',
            maxWidth: '800px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginTop: '10px',
            padding: '0 10px'
          }}
        >
          {/* Zoom controls will be portaled here */}
          <div id="embedpdf-zoom-controls-container" style={{ width: '100%' }} />
          
          {/* Action Buttons */}
          <div className="action-buttons-external" style={{
            width: '100%',
            display: 'flex',
            gap: '10px'
          }}>
          <button
            onClick={toggleDrawingMode}
            style={{
              flex: 1,
              background: isDrawingMode ? '#dc3545' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            {isDrawingMode ? 'Exit Sign' : 'Sign'}
          </button>
          
          {onSave && (
            <button
              onClick={handleSave}
              style={{
                flex: 1,
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Save
            </button>
          )}
          
          <button
            onClick={clearDrawing}
            style={{
              flex: 1,
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Clear
          </button>
          </div>
        </div>
      )}
    </div>
  );
});

EmbedPDFViewer.displayName = 'EmbedPDFViewer';

// Zoom Controls Component (must be inside EmbedPDF context)
// Uses React Portal to render in the toolbar area outside the PDF viewport
const EmbedPDFZoomControls = forwardRef<{ setZoom: (level: number) => void; getZoom: () => number }, {}>(
  (_props, ref) => {
    const { provides: zoomProvides, state: zoomState } = useZoom();
    const [zoomLevel, setZoomLevel] = useState(1.0);
    const [toolbarContainer, setToolbarContainer] = useState<HTMLElement | null>(null);

    // Update zoom level when state changes
    useEffect(() => {
      if (zoomState?.currentZoomLevel !== undefined) {
        setZoomLevel(zoomState.currentZoomLevel);
      }
    }, [zoomState?.currentZoomLevel]);

    // Find the toolbar container (zoom controls placeholder)
    useEffect(() => {
      const findToolbarContainer = () => {
        return document.getElementById('embedpdf-zoom-controls-container');
      };

      // Try to find it immediately
      let container = findToolbarContainer();
      if (!container) {
        // If not found, wait a bit for DOM to render
        const timeout = setTimeout(() => {
          container = findToolbarContainer();
          if (container) {
            setToolbarContainer(container);
          }
        }, 100);
        return () => clearTimeout(timeout);
      } else {
        setToolbarContainer(container);
      }
    }, []);

    // Expose zoom controls to parent
    useImperativeHandle(ref, () => ({
      setZoom: (level: number) => {
        if (zoomProvides) {
          zoomProvides.requestZoom(level);
        }
      },
      getZoom: () => zoomLevel
    }));

    if (!zoomProvides) {
      return null;
    }

    const zoomControlsUI = (
      <div className="zoom-controls-external" style={{
        width: '100%',
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 0',
        marginBottom: '10px'
      }}>
        <button
          onClick={zoomProvides.zoomOut}
          style={{
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 14px',
            fontSize: '18px',
            fontWeight: 'bold',
            cursor: 'pointer',
            minWidth: '45px'
          }}
          title="Zoom Out"
        >
          −
        </button>
        
        <span style={{
          padding: '0 12px',
          fontSize: '14px',
          color: '#333',
          minWidth: '70px',
          textAlign: 'center',
          fontWeight: '500'
        }}>
          {Math.round((zoomState?.currentZoomLevel || 1.0) * 100)}%
        </span>
        
        <button
          onClick={zoomProvides.zoomIn}
          style={{
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 14px',
            fontSize: '18px',
            fontWeight: 'bold',
            cursor: 'pointer',
            minWidth: '45px'
          }}
          title="Zoom In"
        >
          +
        </button>
      </div>
    );

    // Render in toolbar container if found, otherwise render inline (will appear after viewport)
    if (toolbarContainer) {
      return createPortal(zoomControlsUI, toolbarContainer);
    }

    // Fallback: render inline (will appear after the viewport)
    return zoomControlsUI;
  }
);

EmbedPDFZoomControls.displayName = 'EmbedPDFZoomControls';

// Annotation Controls Component (must be inside EmbedPDF context)
const EmbedPDFAnnotationControls = forwardRef<{ 
  toggleInk: () => void; 
  clearAnnotations: () => void; 
  isInkMode: boolean;
  getAnnotations: () => any;
  exportPDF: () => Promise<Blob | null>;
}, { onInkModeChange?: (mode: boolean) => void; engineRef?: React.RefObject<any> }>(
  ({ onInkModeChange, engineRef }, ref) => {
    const { provides: annotationProvides, state: annotationState } = useAnnotation();
    const { provides: annotationApi } = useAnnotationCapability();
    const { provides: exportProvides } = useExportCapability();
    const [isInkMode, setIsInkMode] = useState(false);

    // Update ink mode state and notify parent (check if activeToolId is 'ink' or similar)
    useEffect(() => {
      const activeTool = annotationState?.activeToolId;
      const newInkMode = activeTool === 'ink' || activeTool === 'freehand' || activeTool === 'pen';
      setIsInkMode(newInkMode);
      // Notify parent component of state change
      if (onInkModeChange) {
        onInkModeChange(newInkMode);
      }
    }, [annotationState?.activeToolId, onInkModeChange]);

    // Export PDF with annotations using EmbedPDF's Export plugin
    const exportPDF = useCallback(async (): Promise<Blob | null> => {
      if (!exportProvides) {
        console.warn('🔍 exportPDF: Export provides not available');
        return null;
      }

      try {
        console.log('🔍 exportPDF: Using EmbedPDF Export plugin...');
        // Get annotations from all pages to see what we have
        let allAnnotations: any[] = [];
        if (annotationProvides && annotationState?.pages) {
          const annotationProvidesAny = annotationProvides as any;
          const pageIndices = Object.keys(annotationState.pages).map(Number);
          console.log('🔍 exportPDF: Checking annotations on pages:', pageIndices);
          
          for (const pageIndex of pageIndices) {
            try {
              if (typeof annotationProvidesAny.getPageAnnotations === 'function') {
                const pageAnnotationsResult = annotationProvidesAny.getPageAnnotations({ pageIndex });
                console.log(`🔍 exportPDF: Page ${pageIndex} annotations result type:`, typeof pageAnnotationsResult);
                
                // Handle PdfTask (has toPromise method) or Promise
                let pageAnnotations: any;
                if (pageAnnotationsResult && typeof pageAnnotationsResult.toPromise === 'function') {
                  pageAnnotations = await pageAnnotationsResult.toPromise();
                } else {
                  pageAnnotations = await pageAnnotationsResult;
                }
                
                console.log(`🔍 exportPDF: Page ${pageIndex} annotations:`, pageAnnotations);
                if (Array.isArray(pageAnnotations)) {
                  allAnnotations.push(...pageAnnotations);
                  console.log(`🔍 exportPDF: Found ${pageAnnotations.length} annotations on page ${pageIndex}`);
                }
              }
            } catch (error) {
              console.error(`🔍 exportPDF: Error getting annotations for page ${pageIndex}:`, error);
            }
          }
        }
        
        // Log detailed annotation state
        const pagesData = annotationState?.pages || {};
        const pagesWithAnnotations: any = {};
        Object.keys(pagesData).forEach(pageKey => {
          const pageData = pagesData[pageKey as any];
          if (pageData && Array.isArray(pageData)) {
            pagesWithAnnotations[pageKey] = pageData.length;
          }
        });
        
        console.log('🔍 exportPDF: Annotation state before export:', {
          hasPendingChanges: annotationState?.hasPendingChanges,
          pagesCount: Object.keys(pagesData).length,
          annotationsCount: annotationState?.byUid ? Object.keys(annotationState.byUid).length : 0,
          allAnnotationsFound: allAnnotations.length,
          pagesWithAnnotationCounts: pagesWithAnnotations,
          selectedUid: annotationState?.selectedUid,
          pages: pagesData,
          byUid: annotationState?.byUid
        });
        
        // Wait for any pending changes to be processed first
        if (annotationState?.hasPendingChanges) {
          console.log('🔍 exportPDF: Waiting for pending annotation changes to be processed...');
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        // Commit annotations to the PDF document before exporting
        // This ensures all annotation changes are saved to the engine
        if (annotationApi && typeof annotationApi.commit === 'function') {
          console.log('🔍 exportPDF: Committing annotations to PDF document...');
          console.log('🔍 exportPDF: Annotation state before commit:', {
            hasPendingChanges: annotationState?.hasPendingChanges,
            annotationsCount: annotationState?.byUid ? Object.keys(annotationState.byUid).length : 0,
            pagesWithAnnotations: pagesWithAnnotations
          });
          try {
            await annotationApi.commit();
            console.log('🔍 exportPDF: Annotations committed successfully');
            
            // Wait longer after commit to ensure the engine has processed the changes
            // This is important because the commit is asynchronous and the engine needs time
            // to write the annotations to the PDF document structure
            console.log('🔍 exportPDF: Waiting for engine to process committed annotations...');
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log('🔍 exportPDF: Wait complete, proceeding with export');
          } catch (commitError) {
            console.error('🔍 exportPDF: Error committing annotations:', commitError);
          }
        } else if (annotationProvides) {
          // Fallback: try commit on annotationProvides
          const annotationProvidesAny = annotationProvides as any;
          if (typeof annotationProvidesAny.commit === 'function') {
            console.log('🔍 exportPDF: Committing annotations (via annotationProvides)...');
            await annotationProvidesAny.commit();
            await new Promise(resolve => setTimeout(resolve, 500));
          } else {
            console.warn('🔍 exportPDF: No commit method found on annotationProvides or annotationApi');
          }
        } else {
          console.warn('🔍 exportPDF: No annotationApi or annotationProvides available for commit');
          // If no commit method, still wait a bit for any pending changes
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        const exportProvidesAny = exportProvides as any;
        console.log('🔍 exportPDF: Export provides keys:', Object.keys(exportProvidesAny));
        
        // The Export plugin provides saveAsCopy method - this is the recommended way to export PDFs with annotations
        if (typeof exportProvidesAny.saveAsCopy === 'function') {
          console.log('🔍 exportPDF: Calling exportProvides.saveAsCopy()...');
          const saveResult = exportProvidesAny.saveAsCopy();
          console.log('🔍 exportPDF: saveAsCopy returned, type:', typeof saveResult);
          
          // Handle PdfTask (has toPromise method) or Promise
          let pdfBytes: any;
          if (saveResult && typeof saveResult.toPromise === 'function') {
            console.log('🔍 exportPDF: saveAsCopy returned PdfTask, calling toPromise()...');
            pdfBytes = await saveResult.toPromise();
          } else {
            console.log('🔍 exportPDF: saveAsCopy returned Promise directly');
            pdfBytes = await saveResult;
          }
          
          console.log('🔍 exportPDF: PDF bytes received, type:', typeof pdfBytes);
          console.log('🔍 exportPDF: PDF bytes instanceof ArrayBuffer:', pdfBytes instanceof ArrayBuffer);
          console.log('🔍 exportPDF: PDF bytes instanceof Uint8Array:', pdfBytes instanceof Uint8Array);
          console.log('🔍 exportPDF: PDF bytes length:', pdfBytes?.byteLength || pdfBytes?.length || 'unknown');
          
          // Convert to Blob - handle both ArrayBuffer and Uint8Array
          if (pdfBytes instanceof ArrayBuffer) {
            console.log('🔍 exportPDF: Creating Blob from ArrayBuffer');
            return new Blob([pdfBytes], { type: 'application/pdf' });
          } else if (pdfBytes instanceof Uint8Array) {
            console.log('🔍 exportPDF: Creating Blob from Uint8Array');
            // Create a new Uint8Array to ensure we have a proper copy
            const bytes = new Uint8Array(pdfBytes);
            return new Blob([bytes], { type: 'application/pdf' });
          } else {
            console.warn('🔍 exportPDF: Unexpected return type from saveAsCopy:', typeof pdfBytes);
            // Try to convert to ArrayBuffer if it's something else
            const arrayBuffer = await pdfBytes;
            return new Blob([arrayBuffer], { type: 'application/pdf' });
          }
        } else {
          console.warn('🔍 exportPDF: exportProvides.saveAsCopy is not available. Available methods:', Object.keys(exportProvidesAny));
          
          // Fallback: Try using engine.saveAsCopy directly (like the user's example)
          if (engineRef?.current) {
            console.log('🔍 exportPDF: Trying fallback - using engine.saveAsCopy directly...');
            try {
              const engine = engineRef.current;
              
              // Get the document from the engine
              // The engine should have a way to get the current document
              let document: any = null;
              
              // Try different ways to get the document from the engine
              if (typeof engine.getDocument === 'function') {
                document = engine.getDocument();
              } else if (engine.document) {
                document = engine.document;
              } else if (typeof engine.getPdfDocument === 'function') {
                document = engine.getPdfDocument();
              } else if (engine.pdfDocument) {
                document = engine.pdfDocument;
              }
              
              if (document && typeof engine.saveAsCopy === 'function') {
                console.log('🔍 exportPDF: Found engine and document, calling engine.saveAsCopy...');
                const saveResult = engine.saveAsCopy(document);
                
                // Handle PdfTask (has toPromise method) or Promise
                let pdfBytes: any;
                if (saveResult && typeof saveResult.toPromise === 'function') {
                  console.log('🔍 exportPDF: saveAsCopy returned PdfTask, calling toPromise()...');
                  pdfBytes = await saveResult.toPromise();
                } else {
                  console.log('🔍 exportPDF: saveAsCopy returned Promise directly');
                  pdfBytes = await saveResult;
                }
                
                console.log('✅ exportPDF: Successfully got PDF bytes from engine.saveAsCopy');
                
                // Convert to Blob
                if (pdfBytes instanceof ArrayBuffer) {
                  return new Blob([pdfBytes], { type: 'application/pdf' });
                } else if (pdfBytes instanceof Uint8Array) {
                  // Create a new Uint8Array to ensure proper type
                  const bytes = new Uint8Array(pdfBytes);
                  return new Blob([bytes], { type: 'application/pdf' });
                } else {
                  // Try to convert
                  const arrayBuffer = await pdfBytes;
                  return new Blob([arrayBuffer], { type: 'application/pdf' });
                }
              } else {
                console.warn('🔍 exportPDF: Engine or document not available for fallback. Engine methods:', Object.keys(engine || {}));
              }
            } catch (engineError) {
              console.error('🔍 exportPDF: Error using engine.saveAsCopy fallback:', engineError);
            }
          } else {
            console.warn('🔍 exportPDF: Engine ref not available for fallback');
          }
          
          return null;
        }
      } catch (error) {
        console.error('🔍 exportPDF: Error exporting PDF with annotations:', error);
        console.error('🔍 exportPDF: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        return null;
      }
    }, [exportProvides, annotationState, engineRef]);

    // Debug: Log available methods and state
    useEffect(() => {
      if (annotationProvides) {
        console.log('🔍 EmbedPDF Annotation Provides:', Object.keys(annotationProvides));
        console.log('🔍 EmbedPDF Annotation Provides object:', annotationProvides);
        console.log('🔍 EmbedPDF Annotation State:', annotationState);
      } else {
        console.warn('🔍 EmbedPDF Annotation Provides is null/undefined');
      }
    }, [annotationProvides, annotationState]);
    
    // Also log when state changes
    useEffect(() => {
      console.log('🔍 Annotation State Changed:', {
        activeToolId: annotationState?.activeToolId,
        fullState: annotationState
      });
    }, [annotationState]);

    // Expose annotation controls to parent
    useImperativeHandle(ref, () => ({
      toggleInk: () => {
        console.log('🔍 toggleInk called, annotationProvides:', annotationProvides);
        if (annotationProvides) {
          // Type assertion for runtime checks
          const providesAny = annotationProvides as any;
          const currentTool = annotationState?.activeToolId;
          const isInkActive = currentTool === 'ink' || currentTool === 'freehand' || currentTool === 'pen';
          
          // Try different method names for toggling ink/freehand annotation
          if (typeof providesAny.toggleInkAnnotation === 'function') {
            console.log('🔍 Calling toggleInkAnnotation()');
            providesAny.toggleInkAnnotation();
          } else if (typeof providesAny.toggleFreehand === 'function') {
            console.log('🔍 Calling toggleFreehand()');
            providesAny.toggleFreehand();
          } else if (typeof providesAny.toggleInk === 'function') {
            console.log('🔍 Calling toggleInk()');
            providesAny.toggleInk();
          } else if (typeof providesAny.setActiveTool === 'function') {
            // Try setting active tool to ink
            const newTool = isInkActive ? null : 'ink';
            console.log('🔍 Calling setActiveTool("ink"), currentTool:', currentTool);
            providesAny.setActiveTool(newTool);
          } else if (typeof providesAny.setActiveToolId === 'function') {
            // Try setting active tool ID to ink
            const newTool = isInkActive ? null : 'ink';
            console.log('🔍 Calling setActiveToolId("ink"), currentTool:', currentTool);
            providesAny.setActiveToolId(newTool);
          } else if (typeof providesAny.enableInk === 'function') {
            // Try enabling ink mode
            console.log('🔍 Calling enableInk/disableInk, isInkActive:', isInkActive);
            if (isInkActive) {
              providesAny.disableInk?.();
            } else {
              providesAny.enableInk();
            }
          } else {
            console.warn('🔍 Toggle ink method not found. Available methods:', Object.keys(annotationProvides));
            console.warn('🔍 Full annotationProvides object:', annotationProvides);
          }
        } else {
          console.warn('🔍 annotationProvides is not available');
        }
      },
      clearAnnotations: () => {
        if (annotationProvides) {
          // Type assertion for runtime checks
          const providesAny = annotationProvides as any;
          // Clear all annotations - try different methods based on API
          if (typeof providesAny.clearAnnotations === 'function') {
            providesAny.clearAnnotations();
          } else if (typeof providesAny.clearAll === 'function') {
            providesAny.clearAll();
          } else if (typeof providesAny.deleteAll === 'function') {
            providesAny.deleteAll();
          } else {
            console.warn('Clear annotations method not found in EmbedPDF annotation provides');
          }
        }
      },
      isInkMode,
      getAnnotations: () => {
        // Return annotation state for saving
        return annotationState;
      },
      exportPDF
    }));

    // This component doesn't render anything visible - it just provides controls
    return null;
  }
);

EmbedPDFAnnotationControls.displayName = 'EmbedPDFAnnotationControls';

// Drawing canvas wrapper for EmbedPDF
const EmbedPDFDrawingCanvas = React.forwardRef<DrawingCanvasRef, {
  isDrawingMode: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoomLevel: number;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  pdfId?: string;
  pdfUrl?: string | null;
}>(({ isDrawingMode, containerRef, zoomLevel, viewportRef, pdfId, pdfUrl }, ref) => {
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfCanvasRef = useRef<{ canvas: HTMLCanvasElement | null }>({ canvas: null });
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

    // Create hidden canvas for coordinate mapping (only if component is actually used)
  useEffect(() => {
    // Component is disabled, don't create hidden canvas
    // Clean up any existing hidden canvases
    if (containerRef.current) {
      const existingCanvases = containerRef.current.querySelectorAll('canvas.pdf-canvas-hidden, canvas[style*="display: none"]');
      existingCanvases.forEach(canvas => canvas.remove());
    }
    return;
    
    // This code is unreachable (component is disabled), but kept for reference
    // eslint-disable-next-line @typescript-eslint/no-unreachable-code
    if (!containerRef.current || !viewportRef.current) return;

    const hiddenCanvas = document.createElement('canvas');
    hiddenCanvas.style.position = 'absolute';
    hiddenCanvas.style.pointerEvents = 'none';
    hiddenCanvas.style.opacity = '0';
    hiddenCanvas.style.zIndex = '-1';
    hiddenCanvas.style.display = 'none'; // Ensure it's hidden
    hiddenCanvas.className = 'pdf-canvas-hidden';
    // This code is unreachable, but TypeScript still checks it
    // Use non-null assertion since we already checked above
    const container = containerRef.current!;
    container.appendChild(hiddenCanvas);
    hiddenCanvasRef.current = hiddenCanvas;
    pdfCanvasRef.current.canvas = hiddenCanvas;

    const loadPDFForCanvas = async () => {
      const viewport = viewportRef?.current;
      if (!viewport) return;

      try {
        // Find the RenderLayer canvas in the viewport
        const renderLayer = viewport.querySelector('canvas');
        if (!renderLayer) {
          console.warn('EmbedPDF: RenderLayer canvas not found');
          return;
        }

        // Use the provided PDF URL or load from storage
        let pdfBlobUrl = pdfUrl;
        if (!pdfBlobUrl || !pdfBlobUrl.startsWith('blob:')) {
          // Try to get from EmbedPDF's internal state or use PDF.js directly
          // For now, we'll use PDF.js to load from the same source
          if (!pdfId) return;
          const storedPDF = await getPDF(pdfId);
          if (!storedPDF) return;

          const arrayBuffer = await storedPDF.pdf.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer,
            useSystemFonts: true,
          });

          const pdfDoc = await loadingTask.promise;
          pdfDocRef.current = pdfDoc;

          const page = await pdfDoc.getPage(1);
          const viewport = page.getViewport({ scale: 2.0 });

          hiddenCanvas.width = viewport.width;
          hiddenCanvas.height = viewport.height;

          const ctx = hiddenCanvas.getContext('2d');
          if (ctx) {
            await page.render({
              canvasContext: ctx,
              viewport: viewport
            }).promise;
          }
        } else {
          // Use the blob URL to load with PDF.js
          const response = await fetch(pdfBlobUrl);
          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();

          const loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer,
            useSystemFonts: true,
          });

          const pdfDoc = await loadingTask.promise;
          pdfDocRef.current = pdfDoc;

          const page = await pdfDoc.getPage(1);
          const viewport = page.getViewport({ scale: 2.0 });

          hiddenCanvas.width = viewport.width;
          hiddenCanvas.height = viewport.height;

          const ctx = hiddenCanvas.getContext('2d');
          if (ctx) {
            await page.render({
              canvasContext: ctx,
              viewport: viewport
            }).promise;
          }
        }

        // Sync canvas size with RenderLayer
        const renderRect = renderLayer.getBoundingClientRect();
        if (renderRect.width > 0 && renderRect.height > 0) {
          hiddenCanvas.style.width = `${renderRect.width}px`;
          hiddenCanvas.style.height = `${renderRect.height}px`;
        }
      } catch (error) {
        console.error('Error loading PDF for hidden canvas:', error);
      }
    };

    // Wait a bit for EmbedPDF to render
    const timeoutId = setTimeout(loadPDFForCanvas, 500);

    return () => {
      clearTimeout(timeoutId);
      if (hiddenCanvasRef.current?.parentNode) {
        hiddenCanvasRef.current.parentNode.removeChild(hiddenCanvasRef.current);
      }
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
      }
    };
  }, [containerRef, viewportRef, pdfId, pdfUrl]);

  // Sync hidden canvas size with RenderLayer
  useEffect(() => {
    if (!hiddenCanvasRef.current || !viewportRef?.current) return;

    const syncSizes = () => {
      const viewport = viewportRef.current;
      const canvas = hiddenCanvasRef.current;
      if (!viewport || !canvas) return;

      const renderLayer = viewport.querySelector('canvas');
      if (!renderLayer) return;

      const renderRect = renderLayer.getBoundingClientRect();
      if (renderRect.width > 0 && renderRect.height > 0) {
        canvas.style.width = `${renderRect.width}px`;
        canvas.style.height = `${renderRect.height}px`;
      }
    };

    const resizeObserver = new ResizeObserver(syncSizes);
    if (viewportRef.current) {
      resizeObserver.observe(viewportRef.current);
    }
    syncSizes();

    return () => resizeObserver.disconnect();
  }, [viewportRef]);

  return (
    <DrawingCanvas
      ref={ref}
      isDrawingMode={isDrawingMode}
      className="draw-canvas"
      pdfCanvasRef={pdfCanvasRef}
      zoomLevel={zoomLevel}
    />
  );
});

EmbedPDFDrawingCanvas.displayName = 'EmbedPDFDrawingCanvas';

export default EmbedPDFViewer;
