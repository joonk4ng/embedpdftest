// Clean EmbedPDF-based PDF Viewer
import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { getPDF } from '../../utils/pdfStorage';
import { DrawingCanvas, type DrawingCanvasRef } from './DrawingCanvas';
import { savePDFWithSignature, downloadOriginalPDF } from '../../utils/PDF/pdfSaveHandler';
import * as pdfjsLib from 'pdfjs-dist';
import '../../styles/components/EmbedPDFViewer.css';

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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const drawingCanvasRef = useRef<DrawingCanvasRef>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const pdfUrlRef = useRef<string | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [currentZoom, setCurrentZoom] = useState<number>(1.5);

  // Load PDF and create iframe
  useEffect(() => {
    if (!pdfId || !containerRef.current) return;

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

        // Create object URL for the PDF blob
        const pdfUrl = URL.createObjectURL(storedPDF.pdf);
        currentPdfUrl = pdfUrl;
        pdfUrlRef.current = pdfUrl;

        // Load PDF.js document for saving functionality
        const arrayBuffer = await storedPDF.pdf.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ 
          data: arrayBuffer,
          useSystemFonts: true,
          disableFontFace: false,
        });
        const pdfDoc = await loadingTask.promise;
        pdfDocRef.current = pdfDoc;

        if (!mounted) {
          URL.revokeObjectURL(pdfUrl);
          pdfDoc.destroy();
          return;
        }

        // Clear container
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }

        // Create iframe to display PDF
        if (containerRef.current) {
          const iframe = document.createElement('iframe');
          iframe.src = pdfUrl;
          iframe.style.width = '100%';
          iframe.style.height = '600px';
          iframe.style.border = 'none';
          iframe.style.borderRadius = '8px';
          iframe.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
          iframe.style.minHeight = '400px';
          iframe.style.maxWidth = '100%';
          iframe.title = 'PDF Viewer';
          
          iframeRef.current = iframe;
          containerRef.current.appendChild(iframe);
        }

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

  // Toggle drawing mode
  const toggleDrawingMode = useCallback(async () => {
    if (onBeforeSign && !isDrawingMode) {
      try {
        await onBeforeSign();
      } catch (error) {
        console.error('Error in onBeforeSign:', error);
        return;
      }
    }
    setIsDrawingMode(!isDrawingMode);
  }, [isDrawingMode, onBeforeSign]);

  // Clear drawing
  const clearDrawing = useCallback(() => {
    drawingCanvasRef.current?.clearDrawing();
  }, []);

  // Handle saving the PDF with signature
  const handleSave = useCallback(async () => {
    if (!pdfDocRef.current || !onSave) return;

    const drawingCanvas = drawingCanvasRef.current?.canvas;
    if (!drawingCanvas) {
      setError('Failed to save PDF. Drawing canvas not found.');
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

    try {
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

  // Zoom control functions
  const setZoom = useCallback((zoomLevel: number) => {
    setCurrentZoom(zoomLevel);
    // TODO: Implement zoom with iframe if needed
  }, []);

  const getCurrentZoom = useCallback(() => {
    return currentZoom;
  }, [currentZoom]);

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
      
      {isLoading && (
        <div className="loading" style={{
          padding: '20px',
          fontSize: '16px',
          color: '#666'
        }}>
          Loading PDF...
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
        />
        
        {!readOnly && (
          <EmbedPDFDrawingCanvas
            ref={drawingCanvasRef}
            isDrawingMode={isDrawingMode}
            containerRef={containerRef}
            zoomLevel={currentZoom}
            iframeRef={iframeRef}
          />
        )}
      </div>

      {/* Action Buttons */}
      {!readOnly && (
        <div className="action-buttons-external" style={{
          width: '100%',
          maxWidth: '800px',
          display: 'flex',
          gap: '10px',
          marginTop: '10px',
          padding: '0 10px'
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
      )}
    </div>
  );
});

EmbedPDFViewer.displayName = 'EmbedPDFViewer';

// Drawing canvas wrapper for iframe
const EmbedPDFDrawingCanvas = React.forwardRef<DrawingCanvasRef, {
  isDrawingMode: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoomLevel: number;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}>(({ isDrawingMode, containerRef, zoomLevel, iframeRef }, ref) => {
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfCanvasRef = useRef<{ canvas: HTMLCanvasElement | null }>({ canvas: null });
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  // Create hidden canvas for coordinate mapping
  useEffect(() => {
    if (!containerRef.current) return;

    const hiddenCanvas = document.createElement('canvas');
    hiddenCanvas.style.position = 'absolute';
    hiddenCanvas.style.pointerEvents = 'none';
    hiddenCanvas.style.opacity = '0';
    hiddenCanvas.style.zIndex = '-1';
    hiddenCanvas.className = 'pdf-canvas-hidden';
    containerRef.current.appendChild(hiddenCanvas);
    hiddenCanvasRef.current = hiddenCanvas;
    pdfCanvasRef.current.canvas = hiddenCanvas;

    const loadPDFForCanvas = async () => {
      const iframe = iframeRef?.current;
      if (!iframe) return;

      try {
        const pdfUrl = iframe.src;
        if (!pdfUrl || !pdfUrl.startsWith('blob:')) return;

        const response = await fetch(pdfUrl);
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

        if (iframe) {
          const iframeRect = iframe.getBoundingClientRect();
          hiddenCanvas.style.width = `${iframeRect.width}px`;
          hiddenCanvas.style.height = `${iframeRect.height}px`;
        }
      } catch (error) {
        console.error('Error loading PDF for hidden canvas:', error);
      }
    };

    loadPDFForCanvas();

    return () => {
      if (hiddenCanvasRef.current?.parentNode) {
        hiddenCanvasRef.current.parentNode.removeChild(hiddenCanvasRef.current);
      }
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
      }
    };
  }, [containerRef, iframeRef]);

  // Sync hidden canvas size with iframe
  useEffect(() => {
    if (!hiddenCanvasRef.current || !iframeRef?.current) return;

    const syncSizes = () => {
      const iframe = iframeRef.current;
      const canvas = hiddenCanvasRef.current;
      if (!iframe || !canvas) return;

      const iframeRect = iframe.getBoundingClientRect();
      if (iframeRect.width > 0 && iframeRect.height > 0) {
        canvas.style.width = `${iframeRect.width}px`;
        canvas.style.height = `${iframeRect.height}px`;
      }
    };

    const resizeObserver = new ResizeObserver(syncSizes);
    if (iframeRef.current) {
      resizeObserver.observe(iframeRef.current);
    }
    syncSizes();

    return () => resizeObserver.disconnect();
  }, [iframeRef]);

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

