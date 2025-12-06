import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';

/**
 * Visible annotation toolbar component
 * Provides buttons to select annotation tools (highlight, pen, shapes, etc.)
 * Uses React Portal to render in a container outside the viewport
 */
export const EmbedPDFAnnotationToolbar: React.FC<{
  className?: string;
  style?: React.CSSProperties;
}> = ({ className, style }) => {
  const { provides: annotationApi } = useAnnotationCapability();
  const [selected, setSelected] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [toolbarContainer, setToolbarContainer] = useState<HTMLElement | null>(null);

  // Find the toolbar container
  useEffect(() => {
    const findToolbarContainer = () => {
      return document.getElementById('embedpdf-annotation-toolbar-container');
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

  // Listen for selection changes to enable/disable the delete button
  useEffect(() => {
    if (!annotationApi) return;

    const unsubscribe = annotationApi.onStateChange((state: any) => {
      setSelected(!!state.selectedUid);
      setActiveTool(state.activeToolId || null);
    });

    return unsubscribe;
  }, [annotationApi]);

  const deleteSelected = () => {
    const selection = annotationApi?.getSelectedAnnotation();
    if (selection) {
      annotationApi?.deleteAnnotation(selection.object.pageIndex, selection.object.id);
    }
  };

  const setTool = (toolId: string | null) => {
    if (annotationApi) {
      annotationApi.setActiveTool(toolId);
      setActiveTool(toolId);
    }
  };

  if (!annotationApi) {
    return null; // Don't render if API not available
  }

  const toolbarUI = (
    <div
      className={`embedpdf-annotation-toolbar ${className || ''}`}
      style={{
        display: 'flex',
        gap: '8px',
        padding: '12px',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        border: '1px solid #e0e0e0',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        ...style
      }}
    >
      {/* Text annotation tools */}
      <button
        onClick={() => setTool('highlight')}
        style={{
          padding: '8px 12px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          background: activeTool === 'highlight' ? '#007bff' : 'white',
          color: activeTool === 'highlight' ? 'white' : '#333',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500'
        }}
        title="Highlight"
      >
        ✏️ Highlight
      </button>

      <button
        onClick={() => setTool('underline')}
        style={{
          padding: '8px 12px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          background: activeTool === 'underline' ? '#007bff' : 'white',
          color: activeTool === 'underline' ? 'white' : '#333',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500'
        }}
        title="Underline"
      >
        U̲ Underline
      </button>

      {/* Drawing tools */}
      <button
        onClick={() => setTool('ink')}
        style={{
          padding: '8px 12px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          background: activeTool === 'ink' ? '#007bff' : 'white',
          color: activeTool === 'ink' ? 'white' : '#333',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500'
        }}
        title="Pen (Freehand Drawing)"
      >
        ✍️ Pen
      </button>

      {/* Shape tools */}
      <button
        onClick={() => setTool('circle')}
        style={{
          padding: '8px 12px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          background: activeTool === 'circle' ? '#007bff' : 'white',
          color: activeTool === 'circle' ? 'white' : '#333',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500'
        }}
        title="Circle"
      >
        ⭕ Circle
      </button>

      <button
        onClick={() => setTool('square')}
        style={{
          padding: '8px 12px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          background: activeTool === 'square' ? '#007bff' : 'white',
          color: activeTool === 'square' ? 'white' : '#333',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500'
        }}
        title="Square"
      >
        ▢ Square
      </button>

      <button
        onClick={() => setTool('line')}
        style={{
          padding: '8px 12px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          background: activeTool === 'line' ? '#007bff' : 'white',
          color: activeTool === 'line' ? 'white' : '#333',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500'
        }}
        title="Line"
      >
        ─ Line
      </button>

      <button
        onClick={() => setTool('lineArrow')}
        style={{
          padding: '8px 12px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          background: activeTool === 'lineArrow' ? '#007bff' : 'white',
          color: activeTool === 'lineArrow' ? 'white' : '#333',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500'
        }}
        title="Arrow"
      >
        → Arrow
      </button>

      {/* Text tool */}
      <button
        onClick={() => setTool('freeText')}
        style={{
          padding: '8px 12px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          background: activeTool === 'freeText' ? '#007bff' : 'white',
          color: activeTool === 'freeText' ? 'white' : '#333',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500'
        }}
        title="Free Text"
      >
        📝 Text
      </button>

      {/* Delete button (only enabled when annotation is selected) */}
      <button
        onClick={deleteSelected}
        disabled={!selected}
        style={{
          padding: '8px 12px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          background: selected ? '#dc3545' : '#f5f5f5',
          color: selected ? 'white' : '#999',
          cursor: selected ? 'pointer' : 'not-allowed',
          fontSize: '14px',
          fontWeight: '500',
          opacity: selected ? 1 : 0.5
        }}
        title="Delete Selected Annotation"
      >
        🗑️ Delete
      </button>

      {/* Deselect tool */}
      <button
        onClick={() => setTool(null)}
        style={{
          padding: '8px 12px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          background: activeTool === null ? '#6c757d' : 'white',
          color: activeTool === null ? 'white' : '#333',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500'
        }}
        title="Select/Move Mode"
      >
        👆 Select
      </button>
    </div>
  );

  // Render in toolbar container if found, otherwise render inline
  if (toolbarContainer) {
    return createPortal(toolbarUI, toolbarContainer);
  }

  // Fallback: render inline (will appear after the viewport)
  return toolbarUI;
};

