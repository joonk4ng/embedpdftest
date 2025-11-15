// EmbedPDF-based PDF Viewer
import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { DrawingCanvas, type DrawingCanvasRef } from './DrawingCanvas';
import { EmbedPDFZoomControls } from './EmbedPDFZoomControls';
import { EmbedPDFAnnotationControls, type EmbedPDFAnnotationControlsRef } from './EmbedPDFAnnotationControls';
import { downloadOriginalPDF } from '../../utils/PDF/pdfSaveHandler';
import * as pdfjsLib from 'pdfjs-dist';
import { usePDFLoader } from '../../hooks/usePDFLoader';
import '../../styles/components/EmbedPDFViewer.css';

// EmbedPDF imports
import { EmbedPDF } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';
import { Viewport } from '@embedpdf/plugin-viewport/react';
import { Scroller } from '@embedpdf/plugin-scroll/react';
import { RenderLayer } from '@embedpdf/plugin-render/react';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/react';
import { AnnotationLayer } from '@embedpdf/plugin-annotation/react';

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
  const viewportWrapperRef = useRef<HTMLDivElement | null>(null);
  const embedPdfEngineRef = useRef<any>(null);
  
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [componentError, setComponentError] = useState<string | null>(null);

  // Initialize EmbedPDF engine
  const { engine, isLoading: engineLoading } = usePdfiumEngine();
  
  // Store engine reference for saving
  useEffect(() => {
    if (engine) {
      embedPdfEngineRef.current = engine;
    }
  }, [engine]);
  
  // Annotation controls ref (will be set by AnnotationControls component)
  const annotationControlsRef = useRef<EmbedPDFAnnotationControlsRef | null>(null);

  // Load PDF using custom hook
  const { pdfUrl, plugins, isLoading, error, pdfDocRef } = usePDFLoader(pdfId, pdfBlob, date);
  
  // Combine PDF loading error with component-level errors
  const displayError = error || componentError;

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
        setComponentError('Failed to save PDF. Annotation controls not available.');
        console.error('🔍 EmbedPDFViewer: Annotation controls not available');
        return;
      }

      console.log('🔍 EmbedPDFViewer: Exporting PDF with annotations using EmbedPDF saveAsCopy...');
      const annotatedPdfBlob = await annotationControlsRef.current.exportPDF();
      
      if (!annotatedPdfBlob) {
        setComponentError('Failed to save PDF. Could not export PDF with annotations.');
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
      setComponentError(error instanceof Error ? error.message : 'Failed to save PDF');
    }
  }, [onSave]);

  // Handle downloading the original PDF
  const handleDownload = useCallback(async () => {
    if (!pdfDocRef.current) return;
    try {
      await downloadOriginalPDF(pdfDocRef.current, { crewInfo, date });
    } catch (error) {
      console.error('Error downloading PDF:', error);
      setComponentError('Failed to download PDF.');
    }
  }, [pdfDocRef, crewInfo, date]);

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
      {displayError && (
        <div className="error-message" style={{
          color: '#dc3545',
          padding: '10px',
          margin: '10px',
          background: '#f8d7da',
          borderRadius: '4px'
        }}>
          {displayError}
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

  // Create hidden canvas for coordinate mapping (only if component is actually used)
  useEffect(() => {
    // Component is disabled, don't create hidden canvas
    // Clean up any existing hidden canvases
    if (containerRef.current) {
      const existingCanvases = containerRef.current.querySelectorAll('canvas.pdf-canvas-hidden, canvas[style*="display: none"]');
      existingCanvases.forEach(canvas => canvas.remove());
    }
    return;
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
