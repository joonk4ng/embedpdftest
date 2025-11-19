// EmbedPDF-based PDF Viewer
import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { DrawingCanvas, type DrawingCanvasRef } from './DrawingCanvas';
import { EmbedPDFZoomControls } from './EmbedPDFZoomControls';
import { EmbedPDFAnnotationControls, type EmbedPDFAnnotationControlsRef } from './EmbedPDFAnnotationControls';
import { downloadOriginalPDF } from '../../utils/PDF/pdfSaveHandler';
import { createFlattenedPDF, flattenPDFToImage } from '../../utils/PDF/pdfFlattening';
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
  
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [componentError, setComponentError] = useState<string | null>(null);

  // Initialize EmbedPDF engine
  const { engine, isLoading: engineLoading } = usePdfiumEngine();
  
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

  // Handle saving the PDF with signature (uses EmbedPDF's default save logic)
  const handleSave = useCallback(async () => {
    if (!onSave) return;

    try {
      // Use EmbedPDF's exportPDF method to get the PDF with annotations
      // This uses EmbedPDF's native saveAsCopy which preserves annotations correctly
      if (!annotationControlsRef.current?.exportPDF) {
        setComponentError('Failed to save PDF. Annotation controls not available.');
        console.error('🔍 EmbedPDFViewer: Annotation controls not available');
        return;
      }

      console.log('🔍 EmbedPDFViewer: Exporting PDF with annotations using EmbedPDF saveAsCopy...');
      let annotatedPdfBlob: Blob | null;
      try {
        annotatedPdfBlob = await annotationControlsRef.current.exportPDF();
        console.log('🔍 EmbedPDFViewer: exportPDF completed, result:', annotatedPdfBlob ? 'Blob received' : 'null');
      } catch (exportError) {
        console.error('❌ EmbedPDFViewer: Error in exportPDF:', exportError);
        setComponentError('Failed to export PDF with annotations.');
        return;
      }
      
      if (!annotatedPdfBlob) {
        setComponentError('Failed to save PDF. Could not export PDF with annotations.');
        console.error('🔍 EmbedPDFViewer: exportPDF returned null');
        return;
      }

      console.log('🔍 EmbedPDFViewer: Successfully exported PDF with annotations from EmbedPDF');
      console.log('🔍 EmbedPDFViewer: Annotated PDF blob size:', annotatedPdfBlob.size, 'type:', annotatedPdfBlob.type);
      console.log('🔍 EmbedPDFViewer: About to start flattening process...');
      
      // CRITICAL: The annotation has `hasAppearance: false` - it doesn't have an appearance stream
      // This means the annotation won't render when the PDF is opened in most viewers
      // SOLUTION: Capture the rendered canvas from EmbedPDF viewer (which DOES show annotations)
      // and use that to create a flattened PDF
      console.log('🔍 EmbedPDFViewer: Annotation lacks appearance stream - capturing rendered canvas to flatten annotations...');
      let finalPdfBlob: Blob;
      
      try {
        // Wait for annotations to be fully committed and rendered on the canvas
        console.log('🔍 EmbedPDFViewer: Waiting for annotations to be committed and rendered...');
        
        // First, ensure annotations are committed to pages
        if (annotationControlsRef.current) {
          const annotationProvides = annotationControlsRef.current.getAnnotationProvides();
          if (annotationProvides && typeof annotationProvides.commit === 'function') {
            console.log('🔍 EmbedPDFViewer: Committing annotations before capture...');
            try {
              const commitResult = annotationProvides.commit();
              if (commitResult && typeof commitResult.toPromise === 'function') {
                await commitResult.toPromise();
              } else if (commitResult && typeof commitResult.then === 'function') {
                await commitResult;
              }
              console.log('✅ EmbedPDFViewer: Annotations committed');
              // Wait a bit more after commit for rendering
              await new Promise(resolve => setTimeout(resolve, 500));
            } catch (commitError) {
              console.warn('⚠️ EmbedPDFViewer: Error committing annotations:', commitError);
            }
          }
        }
        
        // Wait for canvas to actually render (check multiple times)
        console.log('🔍 EmbedPDFViewer: Waiting for canvas to render...');
        let renderAttempts = 0;
        let validCanvasesFound = false;
        while (renderAttempts < 10 && !validCanvasesFound) {
          await new Promise(resolve => setTimeout(resolve, 200)); // Wait 200ms between checks
          
          const allCanvases = viewportWrapperRef.current?.querySelectorAll('canvas') || [];
          const validCanvases = Array.from(allCanvases).filter(canvas => {
            const htmlCanvas = canvas as HTMLCanvasElement;
            return htmlCanvas.width > 0 && htmlCanvas.height > 0;
          });
          
          if (validCanvases.length > 0) {
            validCanvasesFound = true;
            console.log(`✅ EmbedPDFViewer: Found ${validCanvases.length} valid canvas(es) after ${(renderAttempts + 1) * 200}ms`);
          } else {
            renderAttempts++;
            if (renderAttempts < 10) {
              console.log(`🔍 EmbedPDFViewer: Canvas not ready yet, attempt ${renderAttempts + 1}/10...`);
            }
          }
        }
        
        if (!validCanvasesFound) {
          console.warn('⚠️ EmbedPDFViewer: Canvas did not render after waiting, using exported PDF directly');
          finalPdfBlob = annotatedPdfBlob;
        } else {
          // Capture the rendered canvas from the viewer - this includes the annotations as they're displayed
          console.log('🔍 EmbedPDFViewer: Capturing rendered canvas from viewer...');
          console.log('🔍 EmbedPDFViewer: Viewport wrapper ref:', viewportWrapperRef.current);
          
          // Look for canvas elements - try to find the main render canvas
          // EmbedPDF typically has multiple canvas layers (background, render, annotation)
          const allCanvases = viewportWrapperRef.current?.querySelectorAll('canvas') || [];
          console.log(`🔍 EmbedPDFViewer: Found ${allCanvases.length} total canvas elements`);
          
          // Log all canvas details
          allCanvases.forEach((canvas, idx) => {
            const htmlCanvas = canvas as HTMLCanvasElement;
            console.log(`🔍 EmbedPDFViewer: Canvas ${idx}:`, {
              width: htmlCanvas.width,
              height: htmlCanvas.height,
              style: htmlCanvas.style.cssText,
              className: htmlCanvas.className,
              id: htmlCanvas.id,
              offsetWidth: htmlCanvas.offsetWidth,
              offsetHeight: htmlCanvas.offsetHeight
            });
          });
          
          // Try to find the main render canvas (usually the largest one with actual content)
          // Or combine all visible canvases
          const canvasElements = Array.from(allCanvases).filter(canvas => {
            const htmlCanvas = canvas as HTMLCanvasElement;
            return htmlCanvas.width > 0 && htmlCanvas.height > 0 && 
                   htmlCanvas.offsetWidth > 0 && htmlCanvas.offsetHeight > 0;
          }) as HTMLCanvasElement[];
        
        if (!canvasElements || canvasElements.length === 0) {
          console.warn('⚠️ EmbedPDFViewer: No canvas elements found in viewer, using exported PDF directly');
          // Use the exported PDF directly - it should have annotations even if they lack appearance streams
          finalPdfBlob = annotatedPdfBlob;
          console.log('⚠️ EmbedPDFViewer: Using exported PDF directly (annotations may not render in all viewers), size:', finalPdfBlob.size);
        } else {
          console.log(`🔍 EmbedPDFViewer: Found ${canvasElements.length} canvas elements, checking for content...`);
          
          // Filter to only canvases that have content (non-zero dimensions)
          const validCanvases: HTMLCanvasElement[] = [];
          for (let i = 0; i < canvasElements.length; i++) {
            const canvas = canvasElements[i] as HTMLCanvasElement;
            if (canvas.width > 0 && canvas.height > 0) {
              validCanvases.push(canvas);
              console.log(`✅ EmbedPDFViewer: Canvas ${i + 1} is valid, size: ${canvas.width}x${canvas.height}`);
            } else {
              console.warn(`⚠️ EmbedPDFViewer: Canvas ${i + 1} has zero dimensions, skipping`);
            }
          }
          
          if (validCanvases.length === 0) {
            console.warn('⚠️ EmbedPDFViewer: No valid canvas elements found, using exported PDF directly');
            finalPdfBlob = annotatedPdfBlob;
          } else {
            // Find SVG elements (annotations are often rendered as SVG)
            const svgElements = viewportWrapperRef.current?.querySelectorAll('svg') || [];
            console.log(`🔍 EmbedPDFViewer: Found ${svgElements.length} SVG elements (annotations may be here)`);
            
            // Group canvases and SVGs by page (they should be in the same container)
            // For now, let's composite all layers for each page
            console.log(`🔍 EmbedPDFViewer: Creating composite images from ${validCanvases.length} canvases and ${svgElements.length} SVGs...`);
            const pdfDoc = await PDFLib.PDFDocument.create();
            
            // Try to find page containers first, but also look at viewport level for SVGs
            const pageContainers = viewportWrapperRef.current?.querySelectorAll('[data-embedpdf], [class*="page"], [class*="Page"]') || [];
            console.log(`🔍 EmbedPDFViewer: Found ${pageContainers.length} potential page containers`);
            
            // Also get all SVGs at viewport level (annotations might be here)
            const allSvgs = viewportWrapperRef.current?.querySelectorAll('svg') || [];
            console.log(`🔍 EmbedPDFViewer: Found ${allSvgs.length} SVG elements at viewport level`);
            
            // Log SVG details
            allSvgs.forEach((svg, idx) => {
              const htmlSvg = svg as SVGSVGElement;
              const rect = htmlSvg.getBoundingClientRect();
              console.log(`🔍 EmbedPDFViewer: SVG ${idx}:`, {
                viewBox: htmlSvg.viewBox?.baseVal,
                width: (htmlSvg as any).width?.baseVal?.value || rect.width,
                height: (htmlSvg as any).height?.baseVal?.value || rect.height,
                boundingRect: { width: rect.width, height: rect.height },
                innerHTML: htmlSvg.innerHTML.substring(0, 100) + '...'
              });
            });
            
            // If we have page containers, process each one
            if (pageContainers.length > 0) {
              for (let pageIdx = 0; pageIdx < pageContainers.length; pageIdx++) {
                const container = pageContainers[pageIdx] as HTMLElement;
                const containerCanvases = container.querySelectorAll('canvas');
                const containerSvgs = container.querySelectorAll('svg');
                
                console.log(`🔍 EmbedPDFViewer: Page ${pageIdx + 1} has ${containerCanvases.length} canvases and ${containerSvgs.length} SVGs`);
                
                // Find the main render canvas (usually the largest)
                let mainCanvas: HTMLCanvasElement | null = null;
                let maxArea = 0;
                for (let canvasIdx = 0; canvasIdx < containerCanvases.length; canvasIdx++) {
                  const canvas = containerCanvases[canvasIdx] as HTMLCanvasElement;
                  const area = canvas.width * canvas.height;
                  if (area > maxArea && canvas.width > 0 && canvas.height > 0) {
                    maxArea = area;
                    mainCanvas = canvas;
                  }
                }
                
                if (!mainCanvas) {
                  console.warn(`⚠️ EmbedPDFViewer: No main canvas found for page ${pageIdx + 1}, skipping`);
                  continue;
                }
                
                const canvasWidth = mainCanvas.width;
                const canvasHeight = mainCanvas.height;
                console.log(`🔍 EmbedPDFViewer: Using main canvas for page ${pageIdx + 1}, size: ${canvasWidth}x${canvasHeight}`);
                
                // Create a composite canvas
                const compositeCanvas = document.createElement('canvas');
                compositeCanvas.width = canvasWidth;
                compositeCanvas.height = canvasHeight;
                const compositeCtx = compositeCanvas.getContext('2d');
                
                if (!compositeCtx) {
                  console.error(`❌ EmbedPDFViewer: Failed to get composite canvas context for page ${pageIdx + 1}`);
                  continue;
                }
                
                // Fill with white background
                compositeCtx.fillStyle = 'white';
                compositeCtx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);
                
                // Draw the PDF canvas first
                compositeCtx.drawImage(mainCanvas, 0, 0);
                
                // Draw annotation SVGs on top (from container first, then viewport level)
                const svgsToDraw = containerSvgs.length > 0 ? containerSvgs : allSvgs;
                console.log(`🔍 EmbedPDFViewer: Drawing ${svgsToDraw.length} SVG(s) on page ${pageIdx + 1}`);
                
                for (let svgIdx = 0; svgIdx < svgsToDraw.length; svgIdx++) {
                  const svg = svgsToDraw[svgIdx] as SVGSVGElement;
                  try {
                    // Get SVG dimensions
                    const svgRect = svg.getBoundingClientRect();
                    const containerRect = container.getBoundingClientRect();
                    const viewportRect = viewportWrapperRef.current?.getBoundingClientRect();
                    
                    // Use viewport or container for positioning
                    const baseRect = viewportRect || containerRect;
                    
                    // Get SVG viewBox or use bounding rect
                    const svgViewBox = svg.viewBox?.baseVal;
                    const svgWidth = (svg as any).width?.baseVal?.value || svgRect.width || (svgViewBox ? svgViewBox.width : 0);
                    const svgHeight = (svg as any).height?.baseVal?.value || svgRect.height || (svgViewBox ? svgViewBox.height : 0);
                    
                    console.log(`🔍 EmbedPDFViewer: Processing SVG ${svgIdx}, dimensions: ${svgWidth}x${svgHeight}, rect: ${svgRect.width}x${svgRect.height}`);
                    
                    if (svgWidth === 0 || svgHeight === 0) {
                      console.warn(`⚠️ EmbedPDFViewer: SVG ${svgIdx} has zero dimensions, skipping`);
                      continue;
                    }
                    
                    // Set explicit width/height on SVG for proper rendering
                    const svgClone = svg.cloneNode(true) as SVGSVGElement;
                    if (!svgClone.hasAttribute('width')) {
                      svgClone.setAttribute('width', String(svgWidth));
                    }
                    if (!svgClone.hasAttribute('height')) {
                      svgClone.setAttribute('height', String(svgHeight));
                    }
                    if (!svgClone.hasAttribute('viewBox') && svgViewBox) {
                      svgClone.setAttribute('viewBox', `${svgViewBox.x} ${svgViewBox.y} ${svgViewBox.width} ${svgViewBox.height}`);
                    }
                    
                    // Convert SVG to image and draw it
                    const svgData = new XMLSerializer().serializeToString(svgClone);
                    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                    const svgUrl = URL.createObjectURL(svgBlob);
                    
                    const img = new Image();
                    await new Promise<void>((resolve) => {
                      img.onload = () => {
                        // Calculate position and scale
                        const x = svgRect.left - baseRect.left;
                        const y = svgRect.top - baseRect.top;
                        
                        // Scale to match canvas dimensions
                        const scaleX = compositeCanvas.width / baseRect.width;
                        const scaleY = compositeCanvas.height / baseRect.height;
                        
                        console.log(`🔍 EmbedPDFViewer: Drawing SVG ${svgIdx} at (${x * scaleX}, ${y * scaleY}), size: ${svgRect.width * scaleX}x${svgRect.height * scaleY}`);
                        
                        compositeCtx.drawImage(
                          img,
                          x * scaleX,
                          y * scaleY,
                          svgRect.width * scaleX,
                          svgRect.height * scaleY
                        );
                        URL.revokeObjectURL(svgUrl);
                        resolve();
                      };
                      img.onerror = (error) => {
                        URL.revokeObjectURL(svgUrl);
                        console.warn(`⚠️ EmbedPDFViewer: Failed to load SVG ${svgIdx} for page ${pageIdx + 1}:`, error);
                        resolve(); // Continue even if SVG fails
                      };
                      img.src = svgUrl;
                    });
                  } catch (svgError) {
                    console.warn(`⚠️ EmbedPDFViewer: Error processing SVG ${svgIdx} for page ${pageIdx + 1}:`, svgError);
                  }
                }
                
                // Convert composite canvas to blob
                const compositeBlob = await new Promise<Blob>((resolve, reject) => {
                  compositeCanvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Failed to convert composite canvas to blob'));
                  }, 'image/png', 1.0);
                });
                
                // Embed in PDF
                const imageBytes = await compositeBlob.arrayBuffer();
                const pngImage = await pdfDoc.embedPng(imageBytes);
                const page = pdfDoc.addPage([pngImage.width, pngImage.height]);
                page.drawImage(pngImage, {
                  x: 0,
                  y: 0,
                  width: pngImage.width,
                  height: pngImage.height,
                });
                
                console.log(`✅ EmbedPDFViewer: Added composite page ${pageIdx + 1} to PDF, dimensions: ${pngImage.width}x${pngImage.height}`);
              }
            } else {
              // Fallback: Use viewport-level canvases and SVGs
              console.log(`🔍 EmbedPDFViewer: No page containers found, using viewport-level elements...`);
              
              // Find the largest canvas
              let mainCanvas: HTMLCanvasElement | null = null;
              let maxArea = 0;
              for (let i = 0; i < validCanvases.length; i++) {
                const canvas = validCanvases[i];
                const area = canvas.width * canvas.height;
                if (area > maxArea) {
                  maxArea = area;
                  mainCanvas = canvas;
                }
              }
              
              if (!mainCanvas) {
                console.warn('⚠️ EmbedPDFViewer: No valid canvas found, using exported PDF directly');
                finalPdfBlob = annotatedPdfBlob;
              } else {
                const canvasWidth = mainCanvas.width;
                const canvasHeight = mainCanvas.height;
                
                // Create composite canvas
                const compositeCanvas = document.createElement('canvas');
                compositeCanvas.width = canvasWidth;
                compositeCanvas.height = canvasHeight;
                const compositeCtx = compositeCanvas.getContext('2d');
                
                if (!compositeCtx) {
                  console.error('❌ EmbedPDFViewer: Failed to get composite canvas context');
                  finalPdfBlob = annotatedPdfBlob;
                } else {
                  // Fill with white
                  compositeCtx.fillStyle = 'white';
                  compositeCtx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);
                  
                  // Draw PDF canvas
                  compositeCtx.drawImage(mainCanvas, 0, 0);
                  
                  // Draw SVGs on top
                  const viewportRect = viewportWrapperRef.current?.getBoundingClientRect();
                  if (viewportRect && allSvgs.length > 0) {
                    console.log(`🔍 EmbedPDFViewer: Drawing ${allSvgs.length} SVG(s) on composite canvas`);
                    for (let svgIdx = 0; svgIdx < allSvgs.length; svgIdx++) {
                      const svg = allSvgs[svgIdx] as SVGSVGElement;
                      try {
                        const svgRect = svg.getBoundingClientRect();
                        const svgViewBox = svg.viewBox?.baseVal;
                        const svgWidth = (svg as any).width?.baseVal?.value || svgRect.width || (svgViewBox ? svgViewBox.width : 0);
                        const svgHeight = (svg as any).height?.baseVal?.value || svgRect.height || (svgViewBox ? svgViewBox.height : 0);
                        
                        if (svgWidth > 0 && svgHeight > 0) {
                          const svgClone = svg.cloneNode(true) as SVGSVGElement;
                          if (!svgClone.hasAttribute('width')) svgClone.setAttribute('width', String(svgWidth));
                          if (!svgClone.hasAttribute('height')) svgClone.setAttribute('height', String(svgHeight));
                          if (!svgClone.hasAttribute('viewBox') && svgViewBox) {
                            svgClone.setAttribute('viewBox', `${svgViewBox.x} ${svgViewBox.y} ${svgViewBox.width} ${svgViewBox.height}`);
                          }
                          
                          const svgData = new XMLSerializer().serializeToString(svgClone);
                          const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                          const svgUrl = URL.createObjectURL(svgBlob);
                          
                          const img = new Image();
                          await new Promise<void>((resolve) => {
                            img.onload = () => {
                              const scaleX = compositeCanvas.width / viewportRect.width;
                              const scaleY = compositeCanvas.height / viewportRect.height;
                              const x = (svgRect.left - viewportRect.left) * scaleX;
                              const y = (svgRect.top - viewportRect.top) * scaleY;
                              
                              compositeCtx.drawImage(img, x, y, svgRect.width * scaleX, svgRect.height * scaleY);
                              URL.revokeObjectURL(svgUrl);
                              resolve();
                            };
                            img.onerror = () => {
                              URL.revokeObjectURL(svgUrl);
                              resolve();
                            };
                            img.src = svgUrl;
                          });
                        }
                      } catch (svgError) {
                        console.warn(`⚠️ EmbedPDFViewer: Error processing SVG ${svgIdx}:`, svgError);
                      }
                    }
                  }
                  
                  // Convert to PDF
                  const compositeBlob = await new Promise<Blob>((resolve, reject) => {
                    compositeCanvas.toBlob((blob) => {
                      if (blob) resolve(blob);
                      else reject(new Error('Failed to convert composite canvas to blob'));
                    }, 'image/png', 1.0);
                  });
                  
                  const imageBytes = await compositeBlob.arrayBuffer();
                  const pngImage = await pdfDoc.embedPng(imageBytes);
                  const page = pdfDoc.addPage([pngImage.width, pngImage.height]);
                  page.drawImage(pngImage, {
                    x: 0,
                    y: 0,
                    width: pngImage.width,
                    height: pngImage.height,
                  });
                  
                  console.log(`✅ EmbedPDFViewer: Added composite page to PDF, dimensions: ${pngImage.width}x${pngImage.height}`);
                }
              }
            }
            
            // Save the PDF
            const flattenedPdfBytes = await pdfDoc.save();
            const arrayBuffer = flattenedPdfBytes.buffer instanceof ArrayBuffer 
              ? flattenedPdfBytes.buffer.slice(flattenedPdfBytes.byteOffset, flattenedPdfBytes.byteOffset + flattenedPdfBytes.byteLength)
              : new Uint8Array(flattenedPdfBytes).buffer;
            
            finalPdfBlob = new Blob([arrayBuffer], { type: 'application/pdf' });
            console.log('✅ EmbedPDFViewer: Annotations flattened using composite canvas capture, size:', finalPdfBlob.size);
          }
        }
        }
      } catch (canvasCaptureError) {
        console.error('❌ EmbedPDFViewer: Error capturing canvas:', canvasCaptureError);
        console.warn('⚠️ EmbedPDFViewer: Using exported PDF directly as fallback');
        // Use the exported PDF directly as fallback
        finalPdfBlob = annotatedPdfBlob;
      }
      
      console.log('🔍 EmbedPDFViewer: About to call onSave with finalPdfBlob, size:', finalPdfBlob.size);
      
      // Create preview image from the final PDF using PDF.js
      try {
        const pdfjsDoc = await pdfjsLib.getDocument({ data: await finalPdfBlob.arrayBuffer() }).promise;
        const pdfjsPage = await pdfjsDoc.getPage(1);
        const viewport = pdfjsPage.getViewport({ scale: 2.0 });
        
        const previewCanvas = document.createElement('canvas');
        previewCanvas.width = viewport.width;
        previewCanvas.height = viewport.height;
        const ctx = previewCanvas.getContext('2d');
        
        if (ctx) {
          await pdfjsPage.render({ canvasContext: ctx, viewport }).promise;
          const previewBlob = await new Promise<Blob>((resolve) => {
            previewCanvas.toBlob((blob) => resolve(blob || new Blob()), 'image/png');
          });
          
          // Pass the flattened PDF with annotations rendered as content
          onSave(finalPdfBlob, previewBlob);
        } else {
          // If preview generation fails, still save the PDF
          console.warn('🔍 EmbedPDFViewer: Could not generate preview, saving PDF anyway');
          const emptyPreview = new Blob([], { type: 'image/png' });
          onSave(finalPdfBlob, emptyPreview);
        }
      } catch (previewError) {
        // If preview generation fails, still save the PDF
        console.warn('🔍 EmbedPDFViewer: Preview generation failed, saving PDF anyway:', previewError);
        const emptyPreview = new Blob([], { type: 'image/png' });
        onSave(finalPdfBlob, emptyPreview);
      }
    } catch (error) {
      console.error('🔍 EmbedPDFViewer: Error saving PDF:', error);
      setComponentError(error instanceof Error ? error.message : 'Failed to save PDF');
    }
  }, [onSave]);

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
