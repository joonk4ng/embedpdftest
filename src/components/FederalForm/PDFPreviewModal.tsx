import React from 'react';
import './PDFPreviewModal.css';

interface PDFPreviewModalProps {
  isOpen: boolean;
  previewPDF: {
    pdf: Blob;
    preview: Blob | null;
    metadata: any;
  } | null;
  onClose: () => void;
}

export const PDFPreviewModal: React.FC<PDFPreviewModalProps> = ({
  isOpen,
  previewPDF,
  onClose
}) => {
  if (!isOpen || !previewPDF) {
    return null;
  }

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(previewPDF.pdf);
    link.download = previewPDF.metadata.filename;
    link.click();
  };

  return (
    <div className="pdf-preview-modal-overlay">
      <div className="pdf-preview-modal-content">
        <button
          onClick={onClose}
          className="pdf-preview-modal-close"
        >
          ×
        </button>
        <h3 style={{
          margin: '0 0 16px 0',
          fontSize: '18px',
          fontWeight: '600',
          color: '#2c3e50'
        }}>
          PDF Preview: {previewPDF.metadata.filename}
        </h3>
        <div style={{
          border: '1px solid #dee2e6',
          borderRadius: '4px',
          overflow: 'auto',
          flex: 1,
          minHeight: '60vh',
          maxHeight: '80vh'
        }}>
          <iframe
            src={URL.createObjectURL(previewPDF.pdf)}
            style={{
              width: '100%',
              height: '100%',
              minHeight: '60vh',
              border: 'none'
            }}
            title="PDF Preview"
          />
        </div>
        <div style={{
          marginTop: '16px',
          display: 'flex',
          gap: '12px',
          justifyContent: 'center'
        }}>
          <button
            onClick={handleDownload}
            className="pdf-preview-modal-button pdf-preview-modal-button-download"
          >
            📥 Download PDF
          </button>
          <button
            onClick={onClose}
            className="pdf-preview-modal-button pdf-preview-modal-button-close"
          >
            ✕ Close
          </button>
        </div>
      </div>
    </div>
  );
};

