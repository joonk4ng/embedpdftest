import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { usePDFDrawing } from '../../hooks/usePDFDrawing';

export interface DrawingCanvasRef {
  canvas: HTMLCanvasElement | null;
  clearDrawing: () => void;
}

export interface DrawingCanvasProps {
  isDrawingMode: boolean;
  className?: string;
  pdfCanvasRef: React.RefObject<{ canvas: HTMLCanvasElement | null }>;
  zoomLevel?: number;
}

export const DrawingCanvas = forwardRef<DrawingCanvasRef, DrawingCanvasProps>(
  ({ isDrawingMode, className, pdfCanvasRef, zoomLevel = 1.0 }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const { clearDrawing } = usePDFDrawing({
      canvasRef,
      isDrawingMode,
      zoomLevel,
      readOnly: false
    });

    // Sync canvas size with PDF canvas
    useEffect(() => {
      const pdfCanvas = pdfCanvasRef.current?.canvas;
      const drawCanvas = canvasRef.current;
      const container = containerRef.current;

      if (!pdfCanvas || !drawCanvas || !container) return;

      const syncSizes = () => {
        const rect = pdfCanvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          // Set display size
          drawCanvas.style.width = `${rect.width}px`;
          drawCanvas.style.height = `${rect.height}px`;
          
          // Set internal size to match PDF canvas internal size
          const pdfCtx = pdfCanvas.getContext('2d');
          if (pdfCtx) {
            drawCanvas.width = pdfCanvas.width;
            drawCanvas.height = pdfCanvas.height;
          }

          // Position overlay
          const pdfRect = pdfCanvas.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          drawCanvas.style.position = 'absolute';
          drawCanvas.style.left = `${pdfRect.left - containerRect.left}px`;
          drawCanvas.style.top = `${pdfRect.top - containerRect.top}px`;
        }
      };

      syncSizes();

      const resizeObserver = new ResizeObserver(syncSizes);
      resizeObserver.observe(pdfCanvas);

      return () => resizeObserver.disconnect();
    }, [pdfCanvasRef]);

    useImperativeHandle(ref, () => ({
      canvas: canvasRef.current,
      clearDrawing
    }));

    if (!isDrawingMode) return null;

    return (
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: isDrawingMode ? 'auto' : 'none',
          zIndex: 10
        }}
      >
        <canvas
          ref={canvasRef}
          className={className}
          style={{
            position: 'absolute',
            pointerEvents: isDrawingMode ? 'auto' : 'none',
            touchAction: 'none'
          }}
        />
      </div>
    );
  }
);

DrawingCanvas.displayName = 'DrawingCanvas';

