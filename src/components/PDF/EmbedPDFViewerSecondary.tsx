// Secondary EmbedPDF-based PDF Viewer with ViewportPluginPackage configuration
import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { EmbedPDFZoomControls } from './EmbedPDFZoomControls';
import { EmbedPDFAnnotationControls, type EmbedPDFAnnotationControlsRef } from './EmbedPDFAnnotationControls';
import { EmbedPDFExportButton } from './EmbedPDFExportButton';
import { EmbedPDFAnnotationEventListener } from './EmbedPDFAnnotationEventListener';
import { savePDFWithEmbedPDFSignature } from '../../utils/PDF/unifiedSignatureHandler';
import * as PDFLib from 'pdf-lib';
import { usePDFLoaderSecondary } from '../../hooks/usePDFLoaderSecondary';
import { updateAnnotations, updateRendering, getPDF } from '../../utils/pdfStorage';
import { convertEmbedPDFAnnotationsToMetadata, convertMetadataToEmbedPDFFormat } from '../../utils/PDF/annotationConverter';
import '../../styles/components/EmbedPDFViewer.css';

// EmbedPDF imports
import { EmbedPDF } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';
import { Viewport } from '@embedpdf/plugin-viewport/react';
import { Scroller } from '@embedpdf/plugin-scroll/react';
import { RenderLayer } from '@embedpdf/plugin-render/react';
import { TilingLayer } from '@embedpdf/plugin-tiling/react';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/react';
import { SelectionLayer } from '@embedpdf/plugin-selection/react';
import { AnnotationLayer } from '@embedpdf/plugin-annotation/react';
import { useLoaderCapability } from '@embedpdf/plugin-loader/react';

// Plugin packages (used in usePDFLoaderSecondary)

export interface EmbedPDFViewerSecondaryProps {
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

export interface EmbedPDFViewerSecondaryRef {
  handleSave: () => void;
}

export const EmbedPDFViewerSecondary = forwardRef<EmbedPDFViewerSecondaryRef, EmbedPDFViewerSecondaryProps>(({
  pdfId,
  pdfBlob,
  onSave,
  onBeforeSign: _onBeforeSign,
  className,
  style,
  readOnly = false,
  crewInfo: _crewInfo,
  date
}, ref) => {
  
  // Log that we're using the secondary viewer
  useEffect(() => {
    console.log('✅ EmbedPDFViewerSecondary: Secondary viewer with ViewportPluginPackage (viewportGap: 10) is being used');
  }, []);
  
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [engineLoading, setEngineLoading] = useState(true);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportWrapperRef = useRef<HTMLDivElement>(null);
  const embedPdfEngineRef = useRef<any>(null);
  const zoomControlsRef = useRef<any>(null);
  const annotationControlsRef = useRef<EmbedPDFAnnotationControlsRef | null>(null);
  const pageDimensionsRef = useRef<{ width: number; height: number; pageIndex: number; scale?: number }[]>([]);
  const pdfPageDimensionsRef = useRef<{ width: number; height: number } | null>(null);

  // Initialize PDFium engine
  const { engine, isLoading: engineIsLoading } = usePdfiumEngine();

  useEffect(() => {
    setEngineLoading(engineIsLoading);
  }, [engineIsLoading]);

  // Debug: Log engine state
  useEffect(() => {
    if (engine) {
      console.log('✅ EmbedPDFViewerSecondary: Engine loaded');
    }
  }, [engine]);

  // Store engine reference for saving
  useEffect(() => {
    if (engine) {
      embedPdfEngineRef.current = engine;
    }
  }, [engine]);

  // Debug: Log PDF ID changes
  useEffect(() => {
    console.log('🔍 EmbedPDFViewerSecondary: pdfId prop changed:', pdfId, 'date:', date);
  }, [pdfId, date]);

  // Load PDF using secondary hook (with ViewportPluginPackage)
  const { pdfUrl, plugins, isLoading, pdfDocRef } = usePDFLoaderSecondary(pdfId, pdfBlob, date);
  
  // Load annotations from metadata when PDF is ready
  useEffect(() => {
    if (!pdfId || isLoading || !pdfUrl || !annotationControlsRef.current) {
      return;
    }
    
    const loadAnnotationsFromMetadata = async () => {
      try {
        const pdfData = await getPDF(pdfId);
        if (pdfData?.annotations && pdfData.annotations.length > 0) {
          console.log('🔍 EmbedPDFViewerSecondary: Loading annotations from metadata...', pdfData.annotations.length);
          
          const embedPDFAnnotations = convertMetadataToEmbedPDFFormat(pdfData.annotations);
          
          const annotationProvides = annotationControlsRef.current?.getAnnotationProvides();
          if (annotationProvides && typeof (annotationProvides as any).loadAnnotations === 'function') {
            await (annotationProvides as any).loadAnnotations(embedPDFAnnotations);
            console.log('✅ EmbedPDFViewerSecondary: Loaded annotations from metadata');
          } else {
            console.warn('⚠️ EmbedPDFViewerSecondary: Cannot load annotations - loadAnnotations method not available');
          }
        }
      } catch (error) {
        console.error('⚠️ EmbedPDFViewerSecondary: Error loading annotations from metadata:', error);
      }
    };
    
    const timer = setTimeout(() => {
      loadAnnotationsFromMetadata();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [pdfId, pdfUrl, isLoading]);

  // Handle saving
  const handleSave = useCallback(async () => {
    if (!onSave) return;

    try {
      console.log('🔍 EmbedPDFViewerSecondary: Starting save process...');

      if (!annotationControlsRef.current) {
        throw new Error('Failed to save PDF. Annotation controls not available.');
      }

      const annotationProvides = annotationControlsRef.current.getAnnotationProvides();
      let annotationState = annotationControlsRef.current.getAnnotations();

      // Commit annotations
      if (annotationProvides) {
        const annotationProvidesAny = annotationProvides as any;
        if (typeof annotationProvidesAny.commit === 'function') {
          await annotationProvidesAny.commit();
          console.log('✅ EmbedPDFViewerSecondary: Annotations committed');
        }
      }

      // Get updated state after commit
      annotationState = annotationControlsRef.current.getAnnotations();

      if (!pdfDocRef.current) {
        throw new Error('Failed to save PDF. PDF document not loaded.');
      }

      const originalPdfBytes = await pdfDocRef.current.getData();
      
      // Get PDF page dimensions
      const firstPage = await pdfDocRef.current.getPage(1);
      const pdfViewport = firstPage.getViewport({ scale: 1.0 });
      const pdfPageWidth = pdfViewport.width;
      const pdfPageHeight = pdfViewport.height;
      
      pdfPageDimensionsRef.current = { width: pdfPageWidth, height: pdfPageHeight };

      // Get rendered page dimensions
      const pageDim = pageDimensionsRef.current.find(p => p.pageIndex === 0);
      const renderedPageWidth = pageDim?.width || pdfPageWidth;
      const renderedPageHeight = pageDim?.height || pdfPageHeight;

      // Store annotations as metadata
      if (pdfId && annotationState?.byUid && Object.keys(annotationState.byUid).length > 0) {
        try {
          const coordinateSpaceContexts = pageDimensionsRef.current.map(pageDim => {
            const pdfDims = pdfPageDimensionsRef.current || { width: pdfPageWidth, height: pdfPageHeight };
            const scale = pageDim.scale ?? (pageDim.width / pdfDims.width);
            
            return {
              pageIndex: pageDim.pageIndex,
              context: {
                renderedPageWidth: pageDim.width,
                renderedPageHeight: pageDim.height,
                pdfPageWidth: pdfDims.width,
                pdfPageHeight: pdfDims.height,
                devicePixelRatio: window.devicePixelRatio || 1,
                scale: scale
              } as import('../../utils/PDF/annotationConverter').CoordinateSpaceContext
            };
          });
          
          const annotationsMetadata = convertEmbedPDFAnnotationsToMetadata(
            annotationState,
            pageDimensionsRef.current,
            coordinateSpaceContexts
          );
          
          await updateAnnotations(pdfId, annotationsMetadata);
          await updateRendering(pdfId, {
            pageDimensions: pageDimensionsRef.current,
            devicePixelRatio: window.devicePixelRatio || 1
          });
        } catch (metadataError) {
          console.error('⚠️ EmbedPDFViewerSecondary: Error storing annotations as metadata:', metadataError);
        }
      }

      // Burn annotations into PDF
      let signedPdfBytes: Uint8Array;
      try {
        let storedAnnotationsMetadata: any[] | undefined;
        if (pdfId) {
          try {
            const pdfData = await getPDF(pdfId);
            storedAnnotationsMetadata = pdfData?.annotations;
          } catch (e) {
            console.warn('⚠️ EmbedPDFViewerSecondary: Could not load stored annotations metadata:', e);
          }
        }
        
        signedPdfBytes = await savePDFWithEmbedPDFSignature(
          originalPdfBytes,
          annotationState,
          renderedPageWidth,
          renderedPageHeight,
          0,
          true,
          storedAnnotationsMetadata
        );
      } catch (signatureError) {
        console.error('❌ EmbedPDFViewerSecondary: Error embedding signature:', signatureError);
        const pdfDoc = await PDFLib.PDFDocument.load(originalPdfBytes);
        try {
          const form = pdfDoc.getForm();
          form.flatten();
        } catch (flattenError) {
          // Ignore
        }
        signedPdfBytes = await pdfDoc.save();
      }

      const pdfBlob = new Blob([signedPdfBytes], { type: 'application/pdf' });
      const previewBlob = pdfBlob; // TODO: Generate preview image
      
      onSave(pdfBlob, previewBlob);
    } catch (error) {
      console.error('❌ EmbedPDFViewerSecondary: Error saving PDF:', error);
      throw error;
    }
  }, [onSave, pdfId, pdfDocRef]);

  useImperativeHandle(ref, () => ({
    handleSave
  }));

  const toggleDrawingMode = useCallback(() => {
    // Toggle EmbedPDF ink annotation mode
    if (annotationControlsRef.current) {
      annotationControlsRef.current.toggleInk();
      // State will be updated via callback from annotation controls
    } else {
      setIsDrawingMode(prev => !prev);
    }
  }, []);

  const clearDrawing = useCallback(() => {
    if (annotationControlsRef.current) {
      const annotationProvides = annotationControlsRef.current.getAnnotationProvides();
      if (annotationProvides) {
        const annotationProvidesAny = annotationProvides as any;
        if (typeof annotationProvidesAny.clear === 'function') {
          annotationProvidesAny.clear();
        }
      }
    }
  }, []);


  if (engineLoading || isLoading || !engine || !pdfUrl || plugins.length === 0) {
    return (
      <div 
        className={`embedpdf-viewer-wrapper ${className || ''}`} 
        style={{
          ...style,
          width: '100%',
          height: '100%',
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
      className={`embedpdf-viewer-wrapper embedpdf-viewer-secondary ${className || ''}`} 
      style={{
        ...style,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        position: 'relative',
        overflow: 'hidden',
        border: '3px solid #28a745', // Green border to visually identify secondary viewer
      }}
      data-viewer-type="secondary"
    >

      {/* PDF Container */}
      <div 
        className="embedpdf-viewer" 
        style={{
          flex: 1,
          width: '100%',
          minHeight: 0,
          position: 'relative',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div 
          className="pdf-container"
          ref={containerRef}
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            position: 'relative',
            padding: '20px 10px',
            boxSizing: 'border-box',
            margin: '0 auto',
            minHeight: 'min-content'
          }}
        >
          <div 
            ref={viewportWrapperRef} 
            style={{ 
              width: '100%', 
              minHeight: '400px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
          >
            <EmbedPDF 
              key={`${pdfUrl}-${plugins.length}`} 
              engine={engine} 
              plugins={plugins}
            >
              <PDFLoaderTrigger pdfUrl={pdfUrl} pdfId={pdfId} />
              {/* Annotation event listener for logging/saving annotations */}
              <EmbedPDFAnnotationEventListener />
              <Viewport 
                style={{ 
                  backgroundColor: '#f1f3f5',
                  width: '100%',
                  minHeight: '400px',
                  position: 'relative',
                  display: 'block',
                  flex: '0 0 auto'
                }}
              >
                <Scroller
                  renderPage={({ width, height, pageIndex, scale, rotation }) => {
                    const existingIndex = pageDimensionsRef.current.findIndex(p => p.pageIndex === pageIndex);
                    if (existingIndex >= 0) {
                      pageDimensionsRef.current[existingIndex] = { width, height, pageIndex, scale };
                    } else {
                      pageDimensionsRef.current.push({ width, height, pageIndex, scale });
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
                          {/* Two-layer rendering strategy for optimal performance */}
                          {/* 1. Low-resolution base layer for immediate feedback */}
                          <RenderLayer pageIndex={pageIndex} scale={0.5} />
                          
                          {/* 2. High-resolution tile layer on top (renders only visible tiles) */}
                          <TilingLayer pageIndex={pageIndex} scale={scale} />
                          
                          {/* 3. Selection layer for text selection */}
                          <SelectionLayer pageIndex={pageIndex} scale={scale} />
                          
                          {/* 4. Annotation layer on top (handles annotation rendering and interactions) */}
                          <AnnotationLayer 
                            pageIndex={pageIndex} 
                            scale={scale} 
                            pageWidth={width}
                            pageHeight={height}
                            rotation={rotation}
                          />
                        </div>
                      </PagePointerProvider>
                    );
                  }}
                />
              </Viewport>
              <EmbedPDFZoomControls ref={zoomControlsRef} />
              <EmbedPDFAnnotationControls ref={annotationControlsRef} onInkModeChange={setIsDrawingMode} engineRef={embedPdfEngineRef} />
            </EmbedPDF>
          </div>
        </div>
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
            padding: '10px',
            flexShrink: 0,
            backgroundColor: '#f5f5f5',
            borderTop: '1px solid #dee2e6',
            position: 'sticky',
            bottom: 0,
            zIndex: 100
          }}
        >
          <div id="embedpdf-zoom-controls-container" style={{ width: '100%' }} />
          
          {/* Export button using useRenderCapability */}
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
            <EmbedPDFExportButton 
              pageIndex={0}
              scaleFactor={3.0}
              onExport={(blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `pdf-page-export.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
            />
          </div>
          
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

EmbedPDFViewerSecondary.displayName = 'EmbedPDFViewerSecondary';

// Component to trigger PDF loading
const PDFLoaderTrigger: React.FC<{ 
  pdfUrl: string | null; 
  pdfId?: string;
}> = ({ pdfUrl, pdfId }) => {
  const { provides: loaderProvides } = useLoaderCapability();
  
  useEffect(() => {
    if (!pdfUrl || !loaderProvides) {
      return;
    }

    const loadPDF = async () => {
      try {
        const existingDoc = loaderProvides.getDocument();
        if (existingDoc) {
          console.log('✅ PDFLoaderTrigger: PDF already loaded');
          return;
        }

        console.log('🔍 PDFLoaderTrigger: Loading PDF from URL...');
        // loadDocument expects format: { type: 'url', pdfFile: { id, url } }
        await loaderProvides.loadDocument({
          type: 'url',
          pdfFile: {
            id: pdfId || 'pdf',
            url: pdfUrl,
          },
        });
        console.log('✅ PDFLoaderTrigger: PDF loaded successfully');
      } catch (error) {
        console.error('❌ PDFLoaderTrigger: Error loading PDF:', error);
      }
    };

    loadPDF();
  }, [pdfUrl, pdfId, loaderProvides]);

  return null;
};

