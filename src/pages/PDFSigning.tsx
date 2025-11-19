import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { EmbedPDFViewer } from '../components/PDF/EmbedPDFViewer';
import { getPDF, storePDFWithId } from '../utils/pdfStorage';
import { logTrace, quickCheckPDF, traceSigningSystem, checkAllPDFs } from '../utils/signingSystemDebug';

const formatToMMDDYY = (date: Date): string => {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  return `${month}/${day}/${year}`;
};

const PDFSigning: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [pdfId, setPdfId] = useState<string>('federal-form');
  const [crewInfo, setCrewInfo] = useState({
    crewNumber: 'N/A',
    fireName: 'N/A',
    fireNumber: 'N/A'
  });
  const [date, setDate] = useState(new Date().toLocaleDateString());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const urlPdfId = searchParams.get('pdfId') || 'federal-form';
    const urlCrewNumber = searchParams.get('crewNumber') || 'N/A';
    const urlFireName = searchParams.get('fireName') || 'N/A';
    const urlFireNumber = searchParams.get('fireNumber') || 'N/A';
    const urlDate = searchParams.get('date') || new Date().toLocaleDateString();

    logTrace('PDFSIGNING_INIT', {
      urlPdfId,
      urlCrewNumber,
      urlFireName,
      urlFireNumber,
      urlDate
    });

    setPdfId(urlPdfId);
    setCrewInfo({
      crewNumber: urlCrewNumber,
      fireName: urlFireName,
      fireNumber: urlFireNumber
    });
    setDate(urlDate);

    const checkPDF = async () => {
      try {
        logTrace('PDFSIGNING_CHECK_PDF_START', { pdfId: urlPdfId });
        
        // Run quick check for debugging
        const quickCheck = await quickCheckPDF(urlPdfId);
        if (!quickCheck.available) {
          logTrace('PDFSIGNING_CHECK_PDF_FAILED', {
            pdfId: urlPdfId,
            error: quickCheck.error,
            details: quickCheck.details
          });
        } else {
          logTrace('PDFSIGNING_CHECK_PDF_SUCCESS', {
            pdfId: urlPdfId,
            details: quickCheck.details
          });
        }
        
        // Run full trace if debugging enabled
        await traceSigningSystem(urlPdfId);
        
        // Check all PDFs in storage for debugging
        await checkAllPDFs();
        
        const storedPDF = await getPDF(urlPdfId);
        if (!storedPDF) {
          logTrace('PDFSIGNING_PDF_NOT_FOUND', { pdfId: urlPdfId });
          setError('PDF not found. Please return to the main page and try again.');
        } else {
          logTrace('PDFSIGNING_PDF_FOUND', {
            pdfId: urlPdfId,
            pdfSize: storedPDF.pdf.size,
            metadata: storedPDF.metadata
          });
        }
        setIsLoading(false);
      } catch (err) {
        logTrace('PDFSIGNING_CHECK_PDF_ERROR', {
          pdfId: urlPdfId,
          error: err instanceof Error ? err.message : String(err)
        });
        setError('Error loading PDF. Please try again.');
        setIsLoading(false);
      }
    };

    checkPDF();
  }, [searchParams]);

  const handleSave = async (pdfData: Blob, previewImage: Blob) => {
    try {
      const saveDate = date || formatToMMDDYY(new Date());
      const crewNumber = crewInfo?.crewNumber && crewInfo.crewNumber !== 'N/A' ? crewInfo.crewNumber : 'Crew';
      const fireName = crewInfo?.fireName && crewInfo.fireName !== 'N/A' ? crewInfo.fireName.replace(/[^a-zA-Z0-9]/g, '-') : 'Fire';
      const fireNumber = crewInfo?.fireNumber && crewInfo.fireNumber !== 'N/A' ? crewInfo.fireNumber : 'Number';
      
      const signedPdfId = `federal-signed-${saveDate.replace(/\//g, '-')}`;
      const filename = `Federal-Form-Signed-${crewNumber}-${fireName}-${fireNumber}-${saveDate.replace(/\//g, '-')}.pdf`;
      
      await storePDFWithId(signedPdfId, pdfData, previewImage, {
        filename: filename,
        date: saveDate,
        crewNumber: crewInfo?.crewNumber || 'N/A',
        fireName: crewInfo?.fireName || 'N/A',
        fireNumber: crewInfo?.fireNumber || 'N/A'
      });
      
      const url = URL.createObjectURL(pdfData);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert('PDF signed and saved to gallery successfully!');
      navigate('/');
    } catch (error) {
      console.error('Error saving PDF:', error);
      alert('Error saving PDF. Please try again.');
    }
  };

  const handleClose = () => {
    navigate('/');
  };

  if (isLoading) {
    return createPortal(
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        zIndex: 10000
      }}>
        <div style={{ fontSize: '18px', color: '#666' }}>Loading PDF...</div>
      </div>,
      document.body
    );
  }

  if (error) {
    return createPortal(
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        padding: '20px',
        zIndex: 10000
      }}>
        <h2 style={{ color: '#dc3545', marginBottom: '20px' }}>Error</h2>
        <p style={{ marginBottom: '20px', fontSize: '16px' }}>{error}</p>
        <button
          onClick={handleClose}
          style={{
            padding: '12px 24px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          Return to Main Page
        </button>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f5f5f5',
      overflow: 'hidden',
      zIndex: 10000
    }}>
      {/* Header */}
      <div style={{
        width: '100%',
        height: '60px',
        backgroundColor: '#f8f9fa',
        borderBottom: '1px solid #dee2e6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <h1 style={{ margin: 0, fontSize: '18px', color: '#333' }}>
            PDF Signing - {crewInfo.fireName}
          </h1>
          <div style={{ fontSize: '14px', color: '#666' }}>
            Crew: {crewInfo.crewNumber} | Date: {date}
          </div>
        </div>
        
        <button
          onClick={handleClose}
          style={{
            background: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          ✕ Close
        </button>
      </div>
      
      {/* PDF Viewer Content */}
      <div style={{
        flex: 1,
        width: '100%',
        height: 'calc(100vh - 60px)',
        overflow: 'auto',
        backgroundColor: '#f5f5f5',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '20px',
        boxSizing: 'border-box'
      }}>
        <EmbedPDFViewer
          pdfId={pdfId}
          onSave={handleSave}
          crewInfo={crewInfo}
          date={date}
        />
      </div>
    </div>,
    document.body
  );
};

export default PDFSigning;



