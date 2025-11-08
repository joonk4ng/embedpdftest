// EmbedPDF-based PDF Viewer
import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { getPDF } from '../../utils/pdfStorage';
import { DrawingCanvas, type DrawingCanvasRef } from './DrawingCanvas';
import { savePDFWithSignature, downloadOriginalPDF } from '../../utils/PDF/pdfSaveHandler';
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
import { AnnotationPluginPackage, AnnotationLayer, useAnnotation } from '@embedpdf/plugin-annotation/react';
import { SelectionPluginPackage } from '@embedpdf/plugin-selection/react';

export interface EmbedPDFViewerProps {
  pdfId?: string;
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
    if (!pdfId) return;

    let mounted = true;
    let currentPdfUrl: string | null = null;

    const loadPDF = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const storedPDF = await getPDF(pdfId);
        if (!storedPDF) {
          throw new Error('PDF not found in storage');
        }

        // Verify the PDF has form fields and check if they're filled
        // This helps ensure we're displaying the correct filled PDF
        let pdfBlob = storedPDF.pdf;
        
        try {
          // Load with pdf-lib to verify form fields are filled
          const pdfDoc = await PDFLib.PDFDocument.load(await storedPDF.pdf.arrayBuffer());
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
          
          // EmbedPDF may not render filled form field values properly
          // Flatten the form to make filled values visible as part of the PDF content
          // This makes the form non-editable, which is fine for the signing/viewing stage
          try {
            if (filledFieldsCount > 0) {
              console.log('🔍 EmbedPDFViewer: Flattening form to make filled values visible in EmbedPDF...');
              // Use the current pdfDoc's form (which may have been filled above)
              const formToFlatten = pdfDoc.getForm();
              formToFlatten.flatten();
              const flattenedBytes = await pdfDoc.save();
              pdfBlob = new Blob([flattenedBytes], { type: 'application/pdf' });
              console.log('🔍 EmbedPDFViewer: Form flattened successfully');
            }
          } catch (flattenError) {
            console.warn('⚠️ EmbedPDFViewer: Could not flatten form, continuing with original PDF:', flattenError);
            // If flattening fails but we filled the PDF, still use the filled version
            if (filledFieldsCount > 0) {
              try {
                const filledBytes = await pdfDoc.save();
                pdfBlob = new Blob([filledBytes], { type: 'application/pdf' });
                console.log('🔍 EmbedPDFViewer: Using filled (but not flattened) PDF');
              } catch (saveError) {
                console.error('⚠️ EmbedPDFViewer: Could not save filled PDF:', saveError);
              }
            }
          }
        } catch (pdfLibError) {
          console.warn('🔍 EmbedPDFViewer: Could not verify form fields with pdf-lib, continuing anyway:', pdfLibError);
          // Continue with the PDF even if we can't verify fields
        }

        // Create object URL for the PDF blob
        const url = URL.createObjectURL(pdfBlob);
        currentPdfUrl = url;
        pdfUrlRef.current = url;
        
        if (!mounted) {
          URL.revokeObjectURL(url);
          return;
        }

        setPdfUrl(url);

        // Load PDF.js document for saving functionality
        const arrayBuffer = await pdfBlob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ 
          data: arrayBuffer,
          useSystemFonts: true,
          disableFontFace: false,
        });
        const pdfDoc = await loadingTask.promise;
        pdfDocRef.current = pdfDoc;

        // Create plugins with the PDF URL
        const pdfPlugins = [
          createPluginRegistration(LoaderPluginPackage, {
            loadingOptions: {
              type: 'url',
              pdfFile: {
                id: pdfId,
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
            ink: {
              color: '#000000',
              thickness: 3,
              enabled: true,
            },
          }),
          createPluginRegistration(ZoomPluginPackage, {
            defaultZoomLevel: ZoomMode.FitPage,
          }),
        ];
        
        setPlugins(pdfPlugins);
        setIsLoading(false);
      } catch (err) {
        console.error('Error loading PDF:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load PDF');
          setIsLoading(false);
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
  }, [pdfId]);

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

  // Handle saving the PDF with signature (now uses EmbedPDF annotations)
  const handleSave = useCallback(async () => {
    if (!pdfDocRef.current || !onSave) return;

    try {
      // Try to export PDF with annotations from EmbedPDF first
      if (annotationControlsRef.current?.exportPDF) {
        console.log('🔍 EmbedPDFViewer: Attempting to export PDF with annotations from EmbedPDF...');
        const annotatedPdfBlob = await annotationControlsRef.current.exportPDF();
        
        if (annotatedPdfBlob) {
          console.log('🔍 EmbedPDFViewer: Successfully exported PDF with annotations from EmbedPDF');
          
          // Create preview image from the annotated PDF
          const pdfjsDoc = await pdfjsLib.getDocument({ data: await annotatedPdfBlob.arrayBuffer() }).promise;
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
            
            onSave(annotatedPdfBlob, previewBlob);
            return;
          }
        }
      }
      
      // Fallback: Try to use the original PDF URL and save without annotations
      // Or try to get annotations from annotation state and add them manually
      console.log('🔍 EmbedPDFViewer: Annotation export failed, trying fallback methods...');
      
      // Try to get annotations from annotation state and render them to canvas
      const annotations = annotationControlsRef.current?.getAnnotations();
      console.log('🔍 EmbedPDFViewer: Annotations from state:', annotations);
      
      // If we have annotations, we could try to render them, but for now,
      // let's save the PDF without annotations as a fallback
      if (pdfUrlRef.current) {
        console.log('🔍 EmbedPDFViewer: Saving PDF without annotations as fallback...');
        try {
          const response = await fetch(pdfUrlRef.current);
          const pdfBlob = await response.blob();
          
          // Create preview from the original PDF
          const pdfjsDoc = await pdfjsLib.getDocument({ data: await pdfBlob.arrayBuffer() }).promise;
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
            
            console.warn('🔍 EmbedPDFViewer: Saved PDF without annotations (export failed)');
            onSave(pdfBlob, previewBlob);
            return;
          }
        } catch (fallbackError) {
          console.error('🔍 EmbedPDFViewer: Fallback save also failed:', fallbackError);
        }
      }
      
      // Last resort: try drawing canvas if available
      console.log('🔍 EmbedPDFViewer: Trying drawing canvas as last resort...');
      const drawingCanvas = drawingCanvasRef.current?.canvas;
      if (!drawingCanvas) {
        setError('Failed to save PDF. Could not export annotations and no drawing canvas available.');
        console.error('🔍 EmbedPDFViewer: All save methods failed');
        return;
      }

      // Create a temporary canvas from PDF.js for saving
      const tempCanvas = document.createElement('canvas');
      const page = await pdfDocRef.current.getPage(1);
      const viewport = page.getViewport({ scale: 2.0 });
      
      tempCanvas.width = viewport.width;
      tempCanvas.height = viewport.height;
      const context = tempCanvas.getContext('2d');
      
      if (!context) {
        setError('Failed to create canvas context for saving.');
        return;
      }

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      await savePDFWithSignature(
        pdfDocRef.current,
        tempCanvas,
        drawingCanvas,
        onSave,
        { crewInfo, date },
        pdfId
      );
    } catch (error) {
      console.error('Error saving PDF:', error);
      setError('Failed to save PDF with signature.');
    }
  }, [pdfDocRef.current, onSave, crewInfo, date, pdfId]);

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
          overflow: isDrawingMode ? 'hidden' : 'auto',
          width: '100%',
          height: 'auto',
          minHeight: '400px',
          position: 'relative',
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
          <div ref={viewportWrapperRef} style={{ width: '100%', height: '100%' }}>
            <EmbedPDF engine={engine} plugins={plugins}>
              <Viewport 
                style={{ 
                  backgroundColor: '#f1f3f5',
                  width: '100%',
                  minHeight: '400px'
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
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            pointerEvents: 'auto',
                            backgroundColor: 'transparent',
                            zIndex: 1
                          }}
                        >
                          <AnnotationLayer 
                            pageIndex={pageIndex} 
                            scale={scale} 
                            rotation={rotation}
                          />
                        </div>
                      </div>
                    </PagePointerProvider>
                  )}
                />
              </Viewport>
              {/* Zoom controls component - must be inside EmbedPDF context but renders outside viewport */}
              <EmbedPDFZoomControls ref={zoomControlsRef} />
              {/* Annotation controls component - must be inside EmbedPDF context */}
              <EmbedPDFAnnotationControls ref={annotationControlsRef} onInkModeChange={setIsDrawingMode} />
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
}, { onInkModeChange?: (mode: boolean) => void }>(
  ({ onInkModeChange }, ref) => {
    const { provides: annotationProvides, state: annotationState } = useAnnotation();
    const { engine } = usePdfiumEngine();
    const [isInkMode, setIsInkMode] = useState(false);

    // Update ink mode state and notify parent
    useEffect(() => {
      if (annotationState?.inkMode !== undefined) {
        const newInkMode = annotationState.inkMode;
        setIsInkMode(newInkMode);
        // Notify parent component of state change
        if (onInkModeChange) {
          onInkModeChange(newInkMode);
        }
      }
    }, [annotationState?.inkMode, onInkModeChange]);

    // Export PDF with annotations
    const exportPDF = useCallback(async (): Promise<Blob | null> => {
      if (!engine) {
        console.warn('🔍 exportPDF: Engine not available');
        return null;
      }
      
      try {
        console.log('🔍 exportPDF: Engine available, trying to export...');
        console.log('🔍 exportPDF: Engine object:', engine);
        console.log('🔍 exportPDF: Engine keys:', Object.keys(engine));
        
        // Try to get the document from the engine and save it with annotations
        // Annotations should be part of the document when saved
        if (typeof engine.saveDocument === 'function') {
          console.log('🔍 exportPDF: Trying engine.saveDocument()');
          const pdfBytes = await engine.saveDocument();
          return new Blob([pdfBytes], { type: 'application/pdf' });
        } else if (typeof engine.exportDocument === 'function') {
          console.log('🔍 exportPDF: Trying engine.exportDocument()');
          const pdfBytes = await engine.exportDocument();
          return new Blob([pdfBytes], { type: 'application/pdf' });
        } else if (typeof engine.getDocumentBytes === 'function') {
          console.log('🔍 exportPDF: Trying engine.getDocumentBytes()');
          const pdfBytes = await engine.getDocumentBytes();
          return new Blob([pdfBytes], { type: 'application/pdf' });
        } else if (engine.documentManager) {
          console.log('🔍 exportPDF: Trying documentManager');
          const docManager = engine.documentManager;
          if (typeof docManager.saveDocument === 'function') {
            const pdfBytes = await docManager.saveDocument();
            return new Blob([pdfBytes], { type: 'application/pdf' });
          }
        } else if (engine.documents) {
          console.log('🔍 exportPDF: Trying engine.documents');
          const documents = engine.documents;
          if (documents && documents.length > 0) {
            const doc = documents[0];
            console.log('🔍 exportPDF: Document found, keys:', Object.keys(doc));
            if (typeof doc.save === 'function') {
              console.log('🔍 exportPDF: Trying doc.save()');
              const pdfBytes = await doc.save();
              return new Blob([pdfBytes], { type: 'application/pdf' });
            } else if (typeof doc.export === 'function') {
              console.log('🔍 exportPDF: Trying doc.export()');
              const pdfBytes = await doc.export();
              return new Blob([pdfBytes], { type: 'application/pdf' });
            } else if (typeof doc.getBytes === 'function') {
              console.log('🔍 exportPDF: Trying doc.getBytes()');
              const pdfBytes = await doc.getBytes();
              return new Blob([pdfBytes], { type: 'application/pdf' });
            }
          }
        }
        
        console.warn('🔍 exportPDF: No export method found. Engine structure:', {
          hasSaveDocument: typeof engine.saveDocument === 'function',
          hasExportDocument: typeof engine.exportDocument === 'function',
          hasGetDocumentBytes: typeof engine.getDocumentBytes === 'function',
          hasDocumentManager: !!engine.documentManager,
          hasDocuments: !!engine.documents,
          engineKeys: Object.keys(engine)
        });
        return null;
      } catch (error) {
        console.error('🔍 exportPDF: Error exporting PDF with annotations:', error);
        return null;
      }
    }, [engine]);

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
        inkMode: annotationState?.inkMode,
        activeTool: annotationState?.activeTool,
        annotations: annotationState?.annotations?.length || 0,
        fullState: annotationState
      });
    }, [annotationState]);

    // Expose annotation controls to parent
    useImperativeHandle(ref, () => ({
      toggleInk: () => {
        console.log('🔍 toggleInk called, annotationProvides:', annotationProvides);
        if (annotationProvides) {
          // Try different method names for toggling ink/freehand annotation
          if (typeof annotationProvides.toggleInkAnnotation === 'function') {
            console.log('🔍 Calling toggleInkAnnotation()');
            annotationProvides.toggleInkAnnotation();
          } else if (typeof annotationProvides.toggleFreehand === 'function') {
            console.log('🔍 Calling toggleFreehand()');
            annotationProvides.toggleFreehand();
          } else if (typeof annotationProvides.toggleInk === 'function') {
            console.log('🔍 Calling toggleInk()');
            annotationProvides.toggleInk();
          } else if (typeof annotationProvides.setInkMode === 'function') {
            // Try setting ink mode directly
            const currentMode = annotationState?.inkMode || false;
            console.log('🔍 Calling setInkMode(!currentMode), currentMode:', currentMode);
            annotationProvides.setInkMode(!currentMode);
          } else if (typeof annotationProvides.setActiveTool === 'function') {
            // Try setting active tool to ink
            const currentTool = annotationState?.activeTool;
            const newTool = currentTool === 'ink' ? null : 'ink';
            console.log('🔍 Calling setActiveTool("ink"), currentTool:', currentTool);
            annotationProvides.setActiveTool(newTool);
          } else if (typeof annotationProvides.enableInk === 'function') {
            // Try enabling ink mode
            const currentMode = annotationState?.inkMode || false;
            console.log('🔍 Calling enableInk/disableInk, currentMode:', currentMode);
            if (currentMode) {
              annotationProvides.disableInk?.();
            } else {
              annotationProvides.enableInk();
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
          // Clear all annotations - try different methods based on API
          if (typeof annotationProvides.clearAnnotations === 'function') {
            annotationProvides.clearAnnotations();
          } else if (typeof annotationProvides.clearAll === 'function') {
            annotationProvides.clearAll();
          } else if (typeof annotationProvides.deleteAll === 'function') {
            annotationProvides.deleteAll();
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
    
    if (!containerRef.current || !viewportRef.current) return;

    const hiddenCanvas = document.createElement('canvas');
    hiddenCanvas.style.position = 'absolute';
    hiddenCanvas.style.pointerEvents = 'none';
    hiddenCanvas.style.opacity = '0';
    hiddenCanvas.style.zIndex = '-1';
    hiddenCanvas.style.display = 'none'; // Ensure it's hidden
    hiddenCanvas.className = 'pdf-canvas-hidden';
    containerRef.current.appendChild(hiddenCanvas);
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
