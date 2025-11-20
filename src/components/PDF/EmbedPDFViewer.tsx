// EmbedPDF-based PDF Viewer
import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { DrawingCanvas, type DrawingCanvasRef } from './DrawingCanvas';
import { EmbedPDFZoomControls } from './EmbedPDFZoomControls';
import { EmbedPDFAnnotationControls, type EmbedPDFAnnotationControlsRef } from './EmbedPDFAnnotationControls';
import { downloadOriginalPDF } from '../../utils/PDF/pdfSaveHandler';
import { savePDFWithEmbedPDFSignature } from '../../utils/PDF/unifiedSignatureHandler';
import * as pdfjsLib from 'pdfjs-dist';
import * as PDFLib from 'pdf-lib';
import { usePDFLoader } from '../../hooks/usePDFLoader';
import { logTrace } from '../../utils/signingSystemDebug';
import '../../styles/components/EmbedPDFViewer.css';

// EmbedPDF imports
import { EmbedPDF } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';
import { Viewport } from '@embedpdf/plugin-viewport/react';
import { Scroller } from '@embedpdf/plugin-scroll/react';
import { RenderLayer } from '@embedpdf/plugin-render/react';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/react';
import { AnnotationLayer } from '@embedpdf/plugin-annotation/react';
import { useLoaderCapability } from '@embedpdf/plugin-loader/react';

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
  
  // Store page dimensions from renderPage callback (used by annotation layer)
  const pageDimensionsRef = useRef<{ width: number; height: number; pageIndex: number }[]>([]);
  
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [componentError, setComponentError] = useState<string | null>(null);

  // Initialize EmbedPDF engine
  // DIAGNOSTIC: Check if usePdfiumEngine accepts options
  // Note: We're calling it without options first to see what's available
  const { engine, isLoading: engineLoading } = usePdfiumEngine();
  
  // DIAGNOSTIC: Log engine structure when available
  useEffect(() => {
    if (engine) {
      console.log('🔍 DIAGNOSTIC: Engine object keys:', Object.keys(engine));
      console.log('🔍 DIAGNOSTIC: Engine type:', typeof engine);
      console.log('🔍 DIAGNOSTIC: Engine constructor:', engine.constructor?.name);
      
      // Check for configuration or options
      const engineAny = engine as any;
      if (engineAny.config) {
        console.log('🔍 DIAGNOSTIC: Engine has config:', engineAny.config);
      }
      if (engineAny.options) {
        console.log('🔍 DIAGNOSTIC: Engine has options:', engineAny.options);
      }
      if (engineAny.settings) {
        console.log('🔍 DIAGNOSTIC: Engine has settings:', engineAny.settings);
      }
    }
  }, [engine]);
  
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
  
  // Debug: Log PDF loading state
  useEffect(() => {
    logTrace('EMBEDPDFVIEWER_STATE', {
      pdfId,
      hasPdfUrl: !!pdfUrl,
      pdfUrl: pdfUrl ? pdfUrl.substring(0, 50) + '...' : null,
      pluginsCount: plugins.length,
      isLoading,
      engineLoading,
      hasEngine: !!engine,
      error: error || componentError
    });
  }, [pdfId, pdfUrl, plugins.length, isLoading, engineLoading, engine, error, componentError]);
  
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

  // Handle saving the PDF with signature using unified signature handler
  const handleSave = useCallback(async () => {
    if (!onSave) return;

    try {
      console.log('🔍 EmbedPDFViewer: Starting unified signature save process...');

      // Get annotation state
      if (!annotationControlsRef.current) {
        setComponentError('Failed to save PDF. Annotation controls not available.');
        console.error('🔍 EmbedPDFViewer: Annotation controls not available');
        return;
      }

      // Get annotation provides to access commit and getPageAnnotations
      const annotationProvides = annotationControlsRef.current.getAnnotationProvides();
      if (!annotationProvides) {
        console.warn('🔍 EmbedPDFViewer: No annotation provides available');
      }

      // Get initial annotation state
      let annotationState = annotationControlsRef.current.getAnnotations();
      console.log('🔍 EmbedPDFViewer: Initial annotation state:', {
        hasPendingChanges: annotationState?.hasPendingChanges,
        byUidCount: annotationState?.byUid ? Object.keys(annotationState.byUid).length : 0,
        pages: annotationState?.pages
      });

      // CRITICAL: Capture annotations from state BEFORE commit (they may disappear after commit)
      const annotationsBeforeCommit: any[] = [];
      if (annotationState?.byUid) {
        annotationsBeforeCommit.push(...Object.values(annotationState.byUid));
        console.log(`🔍 EmbedPDFViewer: Captured ${annotationsBeforeCommit.length} annotations from state.byUid before commit`);
      }

      // CRITICAL: Commit annotations first to ensure they're saved to the PDF document
      // This is the same approach used in the exportPDF function
      let commitSuccess = false;
      if (annotationProvides) {
        const annotationProvidesAny = annotationProvides as any;
        
        // Method 1: Try annotationProvides.commit() (most reliable)
        if (typeof annotationProvidesAny.commit === 'function') {
          try {
            console.log('🔍 EmbedPDFViewer: Committing annotations using annotationProvides.commit()...');
            const commitResult = annotationProvidesAny.commit();
            if (commitResult && typeof commitResult.then === 'function') {
              await commitResult;
            } else if (commitResult && typeof commitResult.toPromise === 'function') {
              await commitResult.toPromise();
            }
            commitSuccess = true;
            console.log('✅ EmbedPDFViewer: Annotations committed successfully via annotationProvides');
          } catch (commitError) {
            console.error('❌ EmbedPDFViewer: Error committing via annotationProvides:', commitError);
          }
        }
        
        // Method 2: Try forceCommit or flush methods
        if (!commitSuccess) {
          if (typeof annotationProvidesAny.forceCommit === 'function') {
            try {
              console.log('🔍 EmbedPDFViewer: Trying forceCommit()...');
              await annotationProvidesAny.forceCommit();
              commitSuccess = true;
              console.log('✅ EmbedPDFViewer: Annotations committed via forceCommit');
            } catch (error) {
              console.warn('⚠️ EmbedPDFViewer: forceCommit failed:', error);
            }
          } else if (typeof annotationProvidesAny.flush === 'function') {
            try {
              console.log('🔍 EmbedPDFViewer: Trying flush()...');
              await annotationProvidesAny.flush();
              commitSuccess = true;
              console.log('✅ EmbedPDFViewer: Annotations flushed');
            } catch (error) {
              console.warn('⚠️ EmbedPDFViewer: flush failed:', error);
            }
          }
        }
        
        if (!commitSuccess) {
          console.warn('⚠️ EmbedPDFViewer: Could not commit annotations - no commit method available');
        }
        
        // CRITICAL: Wait longer after commit to ensure the engine has fully processed the changes
        // The engine needs time to write annotations to the PDF document structure
        console.log('🔍 EmbedPDFViewer: Waiting for engine to process committed annotations...');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second like exportPDF does
      }

      // Wait for annotations to be fully created and committed
      console.log('🔍 EmbedPDFViewer: Waiting for annotations to be fully created...');
      let waitAttempts = 0;
      const maxWaitAttempts = 30; // Wait up to 3 seconds (30 * 100ms)
      
      while (waitAttempts < maxWaitAttempts) {
        annotationState = annotationControlsRef.current.getAnnotations();
        const currentHasPendingChanges = annotationState?.hasPendingChanges;
        const currentAnnotationCount = annotationState?.byUid ? Object.keys(annotationState.byUid).length : 0;
        
        if (!currentHasPendingChanges && currentAnnotationCount > 0) {
          console.log(`✅ EmbedPDFViewer: Annotations ready after ${waitAttempts * 100}ms (${currentAnnotationCount} annotations)`);
          break;
        }
        
        if (waitAttempts === 0) {
          console.log('🔍 EmbedPDFViewer: Waiting for annotations...', {
            hasPendingChanges: currentHasPendingChanges,
            annotationCount: currentAnnotationCount
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
        waitAttempts++;
      }
      
      // Final state check
      annotationState = annotationControlsRef.current.getAnnotations();
      console.log('🔍 EmbedPDFViewer: Final annotation state:', {
        hasPendingChanges: annotationState?.hasPendingChanges,
        byUidCount: annotationState?.byUid ? Object.keys(annotationState.byUid).length : 0
      });

      // Try to get annotations using getPageAnnotations (this gets them from the PDF document)
      let allAnnotations: any[] = [];
      if (annotationProvides && typeof (annotationProvides as any).getPageAnnotations === 'function') {
        try {
          console.log('🔍 EmbedPDFViewer: Getting annotations via getPageAnnotations...');
          const pageIndices = annotationState?.pages ? Object.keys(annotationState.pages).map(Number) : [0];
          console.log('🔍 EmbedPDFViewer: Checking annotations on pages:', pageIndices);
          
          for (const pageIndex of pageIndices) {
            try {
              const pageAnnotationsResult = (annotationProvides as any).getPageAnnotations({ pageIndex });
              let pageAnnotations: any;
              if (pageAnnotationsResult && typeof pageAnnotationsResult.toPromise === 'function') {
                pageAnnotations = await pageAnnotationsResult.toPromise();
              } else if (pageAnnotationsResult && typeof pageAnnotationsResult.then === 'function') {
                pageAnnotations = await pageAnnotationsResult;
              } else {
                pageAnnotations = pageAnnotationsResult;
              }
              
              if (Array.isArray(pageAnnotations)) {
                allAnnotations.push(...pageAnnotations);
                console.log(`🔍 EmbedPDFViewer: Found ${pageAnnotations.length} annotations on page ${pageIndex} via getPageAnnotations`);
                // Log first annotation structure for debugging
                if (pageAnnotations.length > 0) {
                  console.log('🔍 EmbedPDFViewer: First annotation structure:', {
                    keys: Object.keys(pageAnnotations[0] || {}),
                    hasObject: !!(pageAnnotations[0]?.object),
                    hasInkList: !!(pageAnnotations[0]?.object?.inkList || pageAnnotations[0]?.inkList)
                  });
                }
              }
            } catch (error) {
              console.error(`🔍 EmbedPDFViewer: Error getting annotations for page ${pageIndex}:`, error);
            }
          }
        } catch (error) {
          console.error('🔍 EmbedPDFViewer: Error calling getPageAnnotations:', error);
        }
      }

      // Combine annotations from getPageAnnotations with annotations captured before commit
      // Sometimes annotations disappear from state after commit, so we need both sources
      const allAnnotationsToProcess = [...allAnnotations];
      annotationsBeforeCommit.forEach(ann => {
        const annId = ann.id || ann.uid || (ann.object?.id || ann.object?.uid);
        if (annId && !allAnnotationsToProcess.find(a => (a.id || a.uid) === annId)) {
          allAnnotationsToProcess.push(ann);
        }
      });
      
      console.log(`🔍 EmbedPDFViewer: Total annotations to process: ${allAnnotationsToProcess.length} (${allAnnotations.length} from getPageAnnotations, ${annotationsBeforeCommit.length} from state.byUid)`);

      // Use combined annotations
      if (allAnnotationsToProcess.length > 0) {
        console.log('🔍 EmbedPDFViewer: Using combined annotations:', allAnnotationsToProcess.length);
        // Create a synthetic annotation state from the retrieved annotations
        annotationState = {
          ...annotationState,
          byUid: allAnnotationsToProcess.reduce((acc, ann, idx) => {
            // Handle both direct annotations and nested object structure
            const annotationObj = ann.object || ann;
            const uid = ann.id || ann.uid || annotationObj.id || annotationObj.uid || `annotation-${idx}`;
            acc[uid] = ann; // Keep the full annotation structure
            return acc;
          }, {} as any)
        };
      } else {
        console.log('🔍 EmbedPDFViewer: Using annotations from state');
        if (annotationState?.byUid) {
          console.log('🔍 EmbedPDFViewer: Annotations by UID:', Object.keys(annotationState.byUid).length, 'annotations');
        }
      }

      if (!annotationState || !annotationState.byUid || Object.keys(annotationState.byUid).length === 0) {
        console.warn('🔍 EmbedPDFViewer: No annotations found, saving PDF without signature');
      }

      // Get original PDF bytes
      if (!pdfDocRef.current) {
        setComponentError('Failed to save PDF. PDF document not loaded.');
        console.error('🔍 EmbedPDFViewer: PDF document not available');
        return;
      }

      const originalPdfBytes = await pdfDocRef.current.getData();
      console.log('🔍 EmbedPDFViewer: Got original PDF bytes, size:', originalPdfBytes.byteLength);

      // Get PDF page dimensions in points (native PDF coordinate system)
      const firstPage = await pdfDocRef.current.getPage(1);
      const pdfViewport = firstPage.getViewport({ scale: 1.0 });
      const pdfPageWidth = pdfViewport.width;
      const pdfPageHeight = pdfViewport.height;
      console.log('🔍 EmbedPDFViewer: PDF page dimensions (points):', { width: pdfPageWidth, height: pdfPageHeight });

      // Get the annotation layer page dimensions (from PagePointerProvider)
      // These are the dimensions that annotations use for their coordinate space
      let renderedPageWidth = pdfPageWidth;
      let renderedPageHeight = pdfPageHeight;
      
      // First, try to get dimensions from stored page dimensions (from renderPage callback)
      const pageDim = pageDimensionsRef.current.find(p => p.pageIndex === 0);
      if (pageDim) {
        renderedPageWidth = pageDim.width;
        renderedPageHeight = pageDim.height;
        console.log('🔍 EmbedPDFViewer: Using page dimensions from renderPage callback:', {
          width: renderedPageWidth,
          height: renderedPageHeight,
          pageIndex: pageDim.pageIndex,
          ratio: {
            width: (renderedPageWidth / pdfPageWidth).toFixed(4),
            height: (renderedPageHeight / pdfPageHeight).toFixed(4)
          }
        });
      } else {
        // Fallback: get from DOM
        console.warn('⚠️ EmbedPDFViewer: Page dimensions not found in ref, trying DOM...');
        if (viewportWrapperRef.current) {
          // Try to find the actual rendered canvas or page element
          const canvases = viewportWrapperRef.current.querySelectorAll('canvas');
          let renderCanvas: HTMLCanvasElement | null = null;
          let maxArea = 0;
          
          // Find the largest canvas (likely the render layer)
          for (const canvas of Array.from(canvases)) {
            const htmlCanvas = canvas as HTMLCanvasElement;
            const area = htmlCanvas.width * htmlCanvas.height;
            if (area > maxArea && htmlCanvas.width > 0 && htmlCanvas.height > 0) {
              maxArea = area;
              renderCanvas = htmlCanvas;
            }
          }
          
          if (renderCanvas) {
            // Use the canvas's internal dimensions (not display dimensions)
            renderedPageWidth = renderCanvas.width;
            renderedPageHeight = renderCanvas.height;
            console.log('🔍 EmbedPDFViewer: Using render canvas dimensions (fallback):', { 
              width: renderedPageWidth, 
              height: renderedPageHeight
            });
          }
        }
      }

      // Calculate the scale factor from PDF points to rendered pixels
      const scaleX = renderedPageWidth / pdfPageWidth;
      const scaleY = renderedPageHeight / pdfPageHeight;
      console.log('🔍 EmbedPDFViewer: Scale factors (rendered pixels / PDF points):', { scaleX, scaleY });

      // Use unified signature handler to embed signature
      // Pass the rendered page dimensions (pixels) which match the annotation coordinate space
      let signedPdfBytes: Uint8Array;
      try {
        signedPdfBytes = await savePDFWithEmbedPDFSignature(
          originalPdfBytes,
          annotationState,
          renderedPageWidth,  // Use rendered page width (annotation coordinate space)
          renderedPageHeight, // Use rendered page height (annotation coordinate space)
          0, // pageIndex (0-based)
          true // flatten
        );
        console.log('🔍 EmbedPDFViewer: Signature embedded successfully, size:', signedPdfBytes.byteLength);
      } catch (signatureError) {
        console.error('❌ EmbedPDFViewer: Error embedding signature with unified handler:', signatureError);
        console.warn('⚠️ EmbedPDFViewer: Falling back to PDF without signature embedding');
        // If signature embedding fails, just flatten the PDF without signature
        const pdfDoc = await PDFLib.PDFDocument.load(originalPdfBytes);
        try {
          const form = pdfDoc.getForm();
          form.flatten();
        } catch (flattenError) {
          console.warn('⚠️ EmbedPDFViewer: Could not flatten form:', flattenError);
        }
        signedPdfBytes = await pdfDoc.save();
      }

      // Convert to Blob
      const signedPdfBlob = new Blob([signedPdfBytes], { type: 'application/pdf' });

      // Create preview image from the signed PDF using PDF.js
      try {
        const pdfjsDoc = await pdfjsLib.getDocument({ data: signedPdfBytes }).promise;
        const pdfjsPage = await pdfjsDoc.getPage(1);
        const previewViewport = pdfjsPage.getViewport({ scale: 2.0 });
        
        const previewCanvas = document.createElement('canvas');
        previewCanvas.width = previewViewport.width;
        previewCanvas.height = previewViewport.height;
        const ctx = previewCanvas.getContext('2d');
        
        if (ctx) {
          await pdfjsPage.render({ canvasContext: ctx, viewport: previewViewport }).promise;
          const previewBlob = await new Promise<Blob>((resolve) => {
            previewCanvas.toBlob((blob) => resolve(blob || new Blob()), 'image/png');
          });
          
          onSave(signedPdfBlob, previewBlob);
        } else {
          console.warn('🔍 EmbedPDFViewer: Could not generate preview, saving PDF anyway');
          const emptyPreview = new Blob([], { type: 'image/png' });
          onSave(signedPdfBlob, emptyPreview);
        }
      } catch (previewError) {
        console.warn('🔍 EmbedPDFViewer: Preview generation failed, saving PDF anyway:', previewError);
        const emptyPreview = new Blob([], { type: 'image/png' });
        onSave(signedPdfBlob, emptyPreview);
      }
    } catch (error) {
      console.error('🔍 EmbedPDFViewer: Error saving PDF:', error);
      setComponentError(error instanceof Error ? error.message : 'Failed to save PDF');
    }
  }, [onSave, pdfDocRef]);

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
    logTrace('EMBEDPDFVIEWER_RENDER_STATE', {
      engineLoading,
      isLoading,
      hasEngine: !!engine,
      hasPdfUrl: !!pdfUrl,
      pluginsCount: plugins.length,
      pdfUrl: pdfUrl ? pdfUrl.substring(0, 50) + '...' : null,
      error: error
    });
    
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
      logTrace('EMBEDPDFVIEWER_READY', {
        pdfId,
        pdfUrl: pdfUrl.substring(0, 50) + '...',
        pluginsCount: plugins.length
      });
      console.log('✅ EmbedPDFViewer: All conditions met for PDF rendering');
    } else {
      logTrace('EMBEDPDFVIEWER_WAITING', {
        waitingForEngine: engineLoading || !engine,
        waitingForLoading: isLoading,
        waitingForUrl: !pdfUrl,
        waitingForPlugins: plugins.length === 0
      });
      console.log('⏳ EmbedPDFViewer: Waiting for conditions:', {
        waitingForEngine: engineLoading || !engine,
        waitingForLoading: isLoading,
        waitingForUrl: !pdfUrl,
        waitingForPlugins: plugins.length === 0
      });
    }
  }, [engineLoading, isLoading, engine, pdfUrl, plugins.length, error, pdfId]);

  // Monitor when EmbedPDF actually renders
  useEffect(() => {
    if (!engineLoading && !isLoading && engine && pdfUrl && plugins.length > 0) {
      // Wait a bit for EmbedPDF to render
      const timer1 = setTimeout(() => {
        const viewportElement = viewportWrapperRef.current;
        if (viewportElement) {
          const embedPdfElements = viewportElement.querySelectorAll('[data-embedpdf], canvas, svg');
          console.log('🔍 EmbedPDFViewer: DOM check (1s) - found', embedPdfElements.length, 'EmbedPDF elements');
          
          if (embedPdfElements.length === 0) {
            console.warn('⚠️ EmbedPDFViewer: No EmbedPDF elements found in DOM - PDF may not be rendering');
            // Check for any error messages in the DOM
            const errorElements = viewportElement.querySelectorAll('[class*="error"], [class*="Error"]');
            if (errorElements.length > 0) {
              console.error('❌ EmbedPDFViewer: Found error elements:', errorElements);
            }
            // Check if the EmbedPDF root element exists
            const embedPdfRoot = viewportElement.querySelector('[class*="embedpdf"], [id*="embedpdf"]');
            console.log('🔍 EmbedPDFViewer: EmbedPDF root element:', embedPdfRoot);
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
      
      // Check again after 3 seconds
      const timer2 = setTimeout(() => {
        const viewportElement = viewportWrapperRef.current;
        if (viewportElement) {
          const embedPdfElements = viewportElement.querySelectorAll('[data-embedpdf], canvas, svg');
          console.log('🔍 EmbedPDFViewer: DOM check (3s) - found', embedPdfElements.length, 'EmbedPDF elements');
          if (embedPdfElements.length === 0) {
            console.error('❌ EmbedPDFViewer: Still no elements after 3 seconds - PDF loading may have failed');
            // Try to access the engine to see if PDF is loaded
            if (embedPdfEngineRef.current) {
              console.log('🔍 EmbedPDFViewer: Engine available, checking PDF state...');
              try {
                const engine = embedPdfEngineRef.current;
                console.log('🔍 EmbedPDFViewer: Engine methods:', Object.keys(engine));
                // Check if there's a way to get PDF loading state
                if (typeof engine.getDocument === 'function') {
                  const doc = engine.getDocument();
                  console.log('🔍 EmbedPDFViewer: Engine document:', doc);
                }
              } catch (e) {
                console.error('🔍 EmbedPDFViewer: Error checking engine:', e);
              }
            }
          }
        }
      }, 3000);
      
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
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
            <EmbedPDF 
              key={`${pdfUrl}-${plugins.length}`} 
              engine={engine} 
              plugins={plugins}
            >
              {/* PDF Loader Component - uses loader capability to trigger loading and listen for errors */}
              <PDFLoaderTrigger pdfUrl={pdfUrl} pdfId={pdfId} onError={setComponentError} />
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
                  renderPage={({ width, height, pageIndex, scale, rotation }) => {
                    console.log('🔍 Scroller: renderPage called for page', pageIndex, 'width:', width, 'height:', height, 'scale:', scale);
                    
                    // Store page dimensions for coordinate conversion
                    const existingIndex = pageDimensionsRef.current.findIndex(p => p.pageIndex === pageIndex);
                    if (existingIndex >= 0) {
                      pageDimensionsRef.current[existingIndex] = { width, height, pageIndex };
                    } else {
                      pageDimensionsRef.current.push({ width, height, pageIndex });
                    }
                    
                    return (
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
                    );
                  }}
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

// Component to trigger PDF loading using loader capability
const PDFLoaderTrigger: React.FC<{ 
  pdfUrl: string | null; 
  pdfId?: string;
  onError: (error: string | null) => void;
}> = ({ pdfUrl, pdfId, onError }) => {
  const { provides: loaderProvides } = useLoaderCapability();
  
  useEffect(() => {
    if (!pdfUrl || !loaderProvides) {
      logTrace('PDFLOADERTRIGGER_SKIP', {
        pdfId,
        hasPdfUrl: !!pdfUrl,
        hasLoaderProvides: !!loaderProvides
      });
      return;
    }

    logTrace('PDFLOADERTRIGGER_INIT', {
      pdfId,
      pdfUrl: pdfUrl.substring(0, 50) + '...',
      hasLoaderProvides: !!loaderProvides
    });

    console.log('🔍 PDFLoaderTrigger: Loader capability available, checking if PDF needs to be loaded...');
    
    // Check if document is already loaded
    const existingDoc = loaderProvides.getDocument();
    if (existingDoc) {
      logTrace('PDFLOADERTRIGGER_DOC_EXISTS', {
        pdfId,
        documentId: existingDoc.id,
        pageCount: existingDoc.pageCount
      });
      console.log('✅ PDFLoaderTrigger: PDF document already loaded, ID:', existingDoc.id, 'pages:', existingDoc.pageCount);
      console.log('🔍 PDFLoaderTrigger: Document pages:', existingDoc.pages);
      // Document is loaded, but check if pages are available
      if (existingDoc.pageCount === 0) {
        logTrace('PDFLOADERTRIGGER_NO_PAGES', {
          pdfId,
          documentId: existingDoc.id
        });
        console.warn('⚠️ PDFLoaderTrigger: Document loaded but has 0 pages!');
      }
      return;
    }

    // Listen for loader events to catch errors
    const unsubscribeEvents = loaderProvides.onLoaderEvent((event) => {
      logTrace('PDFLOADERTRIGGER_EVENT', {
        pdfId,
        eventType: event.type,
        documentId: (event as any).documentId,
        error: (event as any).error?.message
      });
      console.log('🔍 PDFLoaderTrigger: Loader event:', event);
      if (event.type === 'error') {
        logTrace('PDFLOADERTRIGGER_ERROR', {
          pdfId,
          error: (event as any).error?.message || 'Unknown error'
        });
        console.error('❌ PDFLoaderTrigger: PDF loading error:', event.error);
        onError((event as any).error?.message || 'Failed to load PDF');
      } else if (event.type === 'complete') {
        logTrace('PDFLOADERTRIGGER_COMPLETE', {
          pdfId,
          documentId: (event as any).documentId
        });
        console.log('✅ PDFLoaderTrigger: PDF loading completed, document ID:', (event as any).documentId);
        onError(null);
      } else if (event.type === 'start') {
        logTrace('PDFLOADERTRIGGER_START', {
          pdfId,
          documentId: (event as any).documentId
        });
        console.log('🔍 PDFLoaderTrigger: PDF loading started, document ID:', (event as any).documentId);
      }
    });

    // Listen for document loaded event
    const unsubscribeDocLoaded = loaderProvides.onDocumentLoaded((document) => {
      logTrace('PDFLOADERTRIGGER_DOC_LOADED', {
        pdfId,
        documentId: document.id,
        pageCount: document.pageCount
      });
      console.log('✅ PDFLoaderTrigger: Document loaded event received, ID:', document.id, 'pages:', document.pageCount);
      console.log('🔍 PDFLoaderTrigger: Document pages array:', document.pages);
      if (document.pageCount === 0) {
        logTrace('PDFLOADERTRIGGER_DOC_NO_PAGES', {
          pdfId,
          documentId: document.id
        });
        console.error('❌ PDFLoaderTrigger: Document loaded but has 0 pages! This is a problem.');
      } else {
        logTrace('PDFLOADERTRIGGER_DOC_READY', {
          pdfId,
          documentId: document.id,
          pageCount: document.pageCount
        });
        console.log('✅ PDFLoaderTrigger: Document has', document.pageCount, 'pages, should render now');
      }
      onError(null);
    });

    // Try to manually trigger loading if document isn't loaded
    // The plugin should auto-load from loadingOptions, but if it doesn't, we'll trigger it manually
    const triggerLoad = async () => {
      try {
        logTrace('PDFLOADERTRIGGER_MANUAL_LOAD_START', {
          pdfId,
          pdfUrl: pdfUrl.substring(0, 50) + '...'
        });
        console.log('🔍 PDFLoaderTrigger: Attempting to manually trigger PDF load...');
        const effectivePdfId = pdfId || 'federal-form';
        await loaderProvides.loadDocument({
          type: 'url',
          pdfFile: {
            id: effectivePdfId,
            url: pdfUrl,
          },
        });
        logTrace('PDFLOADERTRIGGER_MANUAL_LOAD_SUCCESS', {
          pdfId: effectivePdfId
        });
        console.log('✅ PDFLoaderTrigger: Manual load triggered successfully');
      } catch (loadError) {
        logTrace('PDFLOADERTRIGGER_MANUAL_LOAD_ERROR', {
          pdfId,
          error: loadError instanceof Error ? loadError.message : String(loadError)
        });
        console.error('❌ PDFLoaderTrigger: Error manually triggering load:', loadError);
        // Don't set error here - the plugin might still auto-load
      }
    };

    // Wait a bit to see if plugin auto-loads, then trigger manually if needed
    const timer = setTimeout(() => {
      const doc = loaderProvides.getDocument();
      if (!doc) {
        logTrace('PDFLOADERTRIGGER_AUTO_LOAD_FAILED', {
          pdfId
        });
        console.log('⚠️ PDFLoaderTrigger: PDF not loaded after delay, triggering manually...');
        triggerLoad();
      } else {
        logTrace('PDFLOADERTRIGGER_AUTO_LOAD_SUCCESS', {
          pdfId,
          documentId: doc.id
        });
        console.log('✅ PDFLoaderTrigger: PDF already loaded by plugin');
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      unsubscribeEvents();
      unsubscribeDocLoaded();
    };
  }, [pdfUrl, pdfId, loaderProvides, onError]);

  return null; // This component doesn't render anything
};


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
