import { useState } from 'react';
import { useRenderCapability } from '@embedpdf/plugin-render/react';

export interface EmbedPDFExportButtonProps {
  pageIndex?: number;
  scaleFactor?: number;
  onExport?: (blob: Blob) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const EmbedPDFExportButton: React.FC<EmbedPDFExportButtonProps> = ({
  pageIndex = 0,
  scaleFactor = 3.0,
  onExport,
  className,
  style
}) => {
  const { provides: render } = useRenderCapability();
  const [isExporting, setIsExporting] = useState(false);

  const exportPage = async () => {
    if (!render) {
      console.warn('⚠️ EmbedPDFExportButton: Render capability not available');
      return;
    }

    setIsExporting(true);
    
    try {
      const task = render.renderPage({ 
        pageIndex, 
        options: { scaleFactor } 
      });

      // task.wait expects (onSuccess, onError) callbacks
      task.wait(
        (blob) => {
          if (onExport) {
            onExport(blob);
          } else {
            // Default: trigger download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `page-${pageIndex + 1}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
          setIsExporting(false);
        },
        (error) => {
          console.error('❌ EmbedPDFExportButton: Error exporting page:', error);
          setIsExporting(false);
        }
      );
    } catch (error) {
      console.error('❌ EmbedPDFExportButton: Error exporting page:', error);
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={exportPage}
      disabled={isExporting || !render}
      className={className}
      style={{
        padding: '8px 16px',
        backgroundColor: isExporting ? '#6c757d' : '#007bff',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: isExporting || !render ? 'not-allowed' : 'pointer',
        fontSize: '14px',
        fontWeight: '500',
        opacity: isExporting || !render ? 0.6 : 1,
        ...style
      }}
    >
      {isExporting ? 'Exporting...' : 'Export Page'}
    </button>
  );
};

