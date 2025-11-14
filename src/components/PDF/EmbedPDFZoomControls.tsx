import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { useZoom } from '@embedpdf/plugin-zoom/react';

export interface EmbedPDFZoomControlsRef {
  setZoom: (level: number) => void;
  getZoom: () => number;
}

// Zoom Controls Component (must be inside EmbedPDF context)
// Uses React Portal to render in the toolbar area outside the PDF viewport
export const EmbedPDFZoomControls = forwardRef<EmbedPDFZoomControlsRef, {}>(
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

