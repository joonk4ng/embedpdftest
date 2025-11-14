import React from 'react';

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
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'flex-end',
      paddingTop: '2.5vh',
      paddingRight: '2.5vw',
      zIndex: 2000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '20px 20px 20px 40px',
        width: '85vw',
        maxWidth: '85vw',
        maxHeight: '90vh',
        overflow: 'auto',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '10px',
            right: '15px',
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#666',
            zIndex: 2001
          }}
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
            style={{
              padding: '10px 20px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            📥 Download PDF
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            ✕ Close
          </button>
        </div>
      </div>
    </div>
  );
};

