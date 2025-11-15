import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useAnnotation, useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { useExportCapability } from '@embedpdf/plugin-export/react';

export interface EmbedPDFAnnotationControlsRef {
  toggleInk: () => void;
  clearAnnotations: () => void;
  isInkMode: boolean;
  getAnnotations: () => any;
  exportPDF: () => Promise<Blob | null>;
}

export interface EmbedPDFAnnotationControlsProps {
  onInkModeChange?: (mode: boolean) => void;
  engineRef?: React.RefObject<any>;
}

// Annotation Controls Component (must be inside EmbedPDF context)
export const EmbedPDFAnnotationControls = forwardRef<
  EmbedPDFAnnotationControlsRef,
  EmbedPDFAnnotationControlsProps
>(({ onInkModeChange, engineRef }, ref) => {
  const { provides: annotationProvides, state: annotationState } = useAnnotation();
  const { provides: annotationApi } = useAnnotationCapability();
  const { provides: exportProvides } = useExportCapability();
  const [isInkMode, setIsInkMode] = useState(false);

  // Update ink mode state and notify parent (check if activeToolId is 'ink' or similar)
  useEffect(() => {
    const activeTool = annotationState?.activeToolId;
    const newInkMode = activeTool === 'ink' || activeTool === 'freehand' || activeTool === 'pen';
    setIsInkMode(newInkMode);
    // Notify parent component of state change
    if (onInkModeChange) {
      onInkModeChange(newInkMode);
    }
  }, [annotationState?.activeToolId, onInkModeChange]);

  // Export PDF with annotations using EmbedPDF's Export plugin
  const exportPDF = useCallback(async (): Promise<Blob | null> => {
    if (!exportProvides) {
      console.warn('🔍 exportPDF: Export provides not available');
      return null;
    }

    try {
      console.log('🔍 exportPDF: Using EmbedPDF Export plugin...');
      // Get annotations from all pages to see what we have
      let allAnnotations: any[] = [];
      if (annotationProvides && annotationState?.pages) {
        const annotationProvidesAny = annotationProvides as any;
        const pageIndices = Object.keys(annotationState.pages).map(Number);
        console.log('🔍 exportPDF: Checking annotations on pages:', pageIndices);
        
        for (const pageIndex of pageIndices) {
          try {
            if (typeof annotationProvidesAny.getPageAnnotations === 'function') {
              const pageAnnotationsResult = annotationProvidesAny.getPageAnnotations({ pageIndex });
              console.log(`🔍 exportPDF: Page ${pageIndex} annotations result type:`, typeof pageAnnotationsResult);
              
              // Handle PdfTask (has toPromise method) or Promise
              let pageAnnotations: any;
              if (pageAnnotationsResult && typeof pageAnnotationsResult.toPromise === 'function') {
                pageAnnotations = await pageAnnotationsResult.toPromise();
              } else {
                pageAnnotations = await pageAnnotationsResult;
              }
              
              console.log(`🔍 exportPDF: Page ${pageIndex} annotations:`, pageAnnotations);
              if (Array.isArray(pageAnnotations)) {
                allAnnotations.push(...pageAnnotations);
                console.log(`🔍 exportPDF: Found ${pageAnnotations.length} annotations on page ${pageIndex}`);
              }
            }
          } catch (error) {
            console.error(`🔍 exportPDF: Error getting annotations for page ${pageIndex}:`, error);
          }
        }
      }
      
      // Log detailed annotation state
      const pagesData = annotationState?.pages || {};
      const pagesWithAnnotations: any = {};
      Object.keys(pagesData).forEach(pageKey => {
        const pageData = pagesData[pageKey as any];
        if (pageData && Array.isArray(pageData)) {
          pagesWithAnnotations[pageKey] = pageData.length;
        }
      });
      
      console.log('🔍 exportPDF: Annotation state before export:', {
        hasPendingChanges: annotationState?.hasPendingChanges,
        pagesCount: Object.keys(pagesData).length,
        annotationsCount: annotationState?.byUid ? Object.keys(annotationState.byUid).length : 0,
        allAnnotationsFound: allAnnotations.length,
        pagesWithAnnotationCounts: pagesWithAnnotations,
        selectedUid: annotationState?.selectedUid,
        pages: pagesData,
        byUid: annotationState?.byUid
      });
      
      // Wait for any pending changes to be processed first
      if (annotationState?.hasPendingChanges) {
        console.log('🔍 exportPDF: Waiting for pending annotation changes to be processed...');
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Commit annotations to the PDF document before exporting
      // This ensures all annotation changes are saved to the engine
      if (annotationApi && typeof annotationApi.commit === 'function') {
        console.log('🔍 exportPDF: Committing annotations to PDF document...');
        console.log('🔍 exportPDF: Annotation state before commit:', {
          hasPendingChanges: annotationState?.hasPendingChanges,
          annotationsCount: annotationState?.byUid ? Object.keys(annotationState.byUid).length : 0,
          pagesWithAnnotations: pagesWithAnnotations
        });
        try {
          await annotationApi.commit();
          console.log('🔍 exportPDF: Annotations committed successfully');
          
          // Wait longer after commit to ensure the engine has processed the changes
          // This is important because the commit is asynchronous and the engine needs time
          // to write the annotations to the PDF document structure
          console.log('🔍 exportPDF: Waiting for engine to process committed annotations...');
          await new Promise(resolve => setTimeout(resolve, 500));
          console.log('🔍 exportPDF: Wait complete, proceeding with export');
        } catch (commitError) {
          console.error('🔍 exportPDF: Error committing annotations:', commitError);
        }
      } else if (annotationProvides) {
        // Fallback: try commit on annotationProvides
        const annotationProvidesAny = annotationProvides as any;
        if (typeof annotationProvidesAny.commit === 'function') {
          console.log('🔍 exportPDF: Committing annotations (via annotationProvides)...');
          await annotationProvidesAny.commit();
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          console.warn('🔍 exportPDF: No commit method found on annotationProvides or annotationApi');
        }
      } else {
        console.warn('🔍 exportPDF: No annotationApi or annotationProvides available for commit');
        // If no commit method, still wait a bit for any pending changes
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      const exportProvidesAny = exportProvides as any;
      console.log('🔍 exportPDF: Export provides keys:', Object.keys(exportProvidesAny));
      
      // The Export plugin provides saveAsCopy method - this is the recommended way to export PDFs with annotations
      if (typeof exportProvidesAny.saveAsCopy === 'function') {
        console.log('🔍 exportPDF: Calling exportProvides.saveAsCopy()...');
        const saveResult = exportProvidesAny.saveAsCopy();
        console.log('🔍 exportPDF: saveAsCopy returned, type:', typeof saveResult);
        
        // Handle PdfTask (has toPromise method) or Promise
        let pdfBytes: any;
        if (saveResult && typeof saveResult.toPromise === 'function') {
          console.log('🔍 exportPDF: saveAsCopy returned PdfTask, calling toPromise()...');
          pdfBytes = await saveResult.toPromise();
        } else {
          console.log('🔍 exportPDF: saveAsCopy returned Promise directly');
          pdfBytes = await saveResult;
        }
        
        console.log('🔍 exportPDF: PDF bytes received, type:', typeof pdfBytes);
        console.log('🔍 exportPDF: PDF bytes instanceof ArrayBuffer:', pdfBytes instanceof ArrayBuffer);
        console.log('🔍 exportPDF: PDF bytes instanceof Uint8Array:', pdfBytes instanceof Uint8Array);
        console.log('🔍 exportPDF: PDF bytes length:', pdfBytes?.byteLength || pdfBytes?.length || 'unknown');
        
        // Convert to Blob - handle both ArrayBuffer and Uint8Array
        if (pdfBytes instanceof ArrayBuffer) {
          console.log('🔍 exportPDF: Creating Blob from ArrayBuffer');
          return new Blob([pdfBytes], { type: 'application/pdf' });
        } else if (pdfBytes instanceof Uint8Array) {
          console.log('🔍 exportPDF: Creating Blob from Uint8Array');
          // Create a new Uint8Array to ensure we have a proper copy
          const bytes = new Uint8Array(pdfBytes);
          return new Blob([bytes], { type: 'application/pdf' });
        } else {
          console.warn('🔍 exportPDF: Unexpected return type from saveAsCopy:', typeof pdfBytes);
          // Try to convert to ArrayBuffer if it's something else
          const arrayBuffer = await pdfBytes;
          return new Blob([arrayBuffer], { type: 'application/pdf' });
        }
      } else {
        console.warn('🔍 exportPDF: exportProvides.saveAsCopy is not available. Available methods:', Object.keys(exportProvidesAny));
        
        // Fallback: Try using engine.saveAsCopy directly (like the user's example)
        if (engineRef?.current) {
          console.log('🔍 exportPDF: Trying fallback - using engine.saveAsCopy directly...');
          try {
            const engine = engineRef.current;
            
            // Get the document from the engine
            // The engine should have a way to get the current document
            let document: any = null;
            
            // Try different ways to get the document from the engine
            if (typeof engine.getDocument === 'function') {
              document = engine.getDocument();
            } else if (engine.document) {
              document = engine.document;
            } else if (typeof engine.getPdfDocument === 'function') {
              document = engine.getPdfDocument();
            } else if (engine.pdfDocument) {
              document = engine.pdfDocument;
            }
            
            if (document && typeof engine.saveAsCopy === 'function') {
              console.log('🔍 exportPDF: Found engine and document, calling engine.saveAsCopy...');
              const saveResult = engine.saveAsCopy(document);
              
              // Handle PdfTask (has toPromise method) or Promise
              let pdfBytes: any;
              if (saveResult && typeof saveResult.toPromise === 'function') {
                console.log('🔍 exportPDF: saveAsCopy returned PdfTask, calling toPromise()...');
                pdfBytes = await saveResult.toPromise();
              } else {
                console.log('🔍 exportPDF: saveAsCopy returned Promise directly');
                pdfBytes = await saveResult;
              }
              
              console.log('✅ exportPDF: Successfully got PDF bytes from engine.saveAsCopy');
              
              // Convert to Blob
              if (pdfBytes instanceof ArrayBuffer) {
                return new Blob([pdfBytes], { type: 'application/pdf' });
              } else if (pdfBytes instanceof Uint8Array) {
                // Create a new Uint8Array to ensure proper type
                const bytes = new Uint8Array(pdfBytes);
                return new Blob([bytes], { type: 'application/pdf' });
              } else {
                // Try to convert
                const arrayBuffer = await pdfBytes;
                return new Blob([arrayBuffer], { type: 'application/pdf' });
              }
            } else {
              console.warn('🔍 exportPDF: Engine or document not available for fallback. Engine methods:', Object.keys(engine || {}));
            }
          } catch (engineError) {
            console.error('🔍 exportPDF: Error using engine.saveAsCopy fallback:', engineError);
          }
        } else {
          console.warn('🔍 exportPDF: Engine ref not available for fallback');
        }
        
        return null;
      }
    } catch (error) {
      console.error('🔍 exportPDF: Error exporting PDF with annotations:', error);
      console.error('🔍 exportPDF: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      return null;
    }
  }, [exportProvides, annotationState, annotationApi, annotationProvides, engineRef]);

  // Debug: Log available methods and state
  useEffect(() => {
    if (annotationProvides) {
      console.log('🔍 EmbedPDF Annotation Provides:', Object.keys(annotationProvides));
      console.log('🔍 EmbedPDF Annotation Provides object:', annotationProvides);
      console.log('🔍 EmbedPDF Annotation State:', annotationState);
    } else {
      console.warn('🔍 EmbedPDF Annotation Provides is null/undefined');
    }
  }, [annotationProvides, annotationState]);
  
  // Also log when state changes
  useEffect(() => {
    console.log('🔍 Annotation State Changed:', {
      activeToolId: annotationState?.activeToolId,
      fullState: annotationState
    });
  }, [annotationState]);

  // Expose annotation controls to parent
  useImperativeHandle(ref, () => ({
    toggleInk: () => {
      console.log('🔍 toggleInk called, annotationProvides:', annotationProvides);
      if (annotationProvides) {
        // Type assertion for runtime checks
        const providesAny = annotationProvides as any;
        const currentTool = annotationState?.activeToolId;
        const isInkActive = currentTool === 'ink' || currentTool === 'freehand' || currentTool === 'pen';
        
        // Try different method names for toggling ink/freehand annotation
        if (typeof providesAny.toggleInkAnnotation === 'function') {
          console.log('🔍 Calling toggleInkAnnotation()');
          providesAny.toggleInkAnnotation();
        } else if (typeof providesAny.toggleFreehand === 'function') {
          console.log('🔍 Calling toggleFreehand()');
          providesAny.toggleFreehand();
        } else if (typeof providesAny.toggleInk === 'function') {
          console.log('🔍 Calling toggleInk()');
          providesAny.toggleInk();
        } else if (typeof providesAny.setActiveTool === 'function') {
          // Try setting active tool to ink
          const newTool = isInkActive ? null : 'ink';
          console.log('🔍 Calling setActiveTool("ink"), currentTool:', currentTool);
          providesAny.setActiveTool(newTool);
        } else if (typeof providesAny.setActiveToolId === 'function') {
          // Try setting active tool ID to ink
          const newTool = isInkActive ? null : 'ink';
          console.log('🔍 Calling setActiveToolId("ink"), currentTool:', currentTool);
          providesAny.setActiveToolId(newTool);
        } else if (typeof providesAny.enableInk === 'function') {
          // Try enabling ink mode
          console.log('🔍 Calling enableInk/disableInk, isInkActive:', isInkActive);
          if (isInkActive) {
            providesAny.disableInk?.();
          } else {
            providesAny.enableInk();
          }
        } else {
          console.warn('🔍 Toggle ink method not found. Available methods:', Object.keys(annotationProvides));
          console.warn('🔍 Full annotationProvides object:', annotationProvides);
        }
      } else {
        console.warn('🔍 annotationProvides is not available');
      }
    },
    clearAnnotations: () => {
      if (annotationProvides) {
        // Type assertion for runtime checks
        const providesAny = annotationProvides as any;
        // Clear all annotations - try different methods based on API
        if (typeof providesAny.clearAnnotations === 'function') {
          providesAny.clearAnnotations();
        } else if (typeof providesAny.clearAll === 'function') {
          providesAny.clearAll();
        } else if (typeof providesAny.deleteAll === 'function') {
          providesAny.deleteAll();
        } else {
          console.warn('Clear annotations method not found in EmbedPDF annotation provides');
        }
      }
    },
    isInkMode,
    getAnnotations: () => {
      // Return annotation state for saving
      return annotationState;
    },
    exportPDF
  }));

  // This component doesn't render anything visible - it just provides controls
  return null;
});

EmbedPDFAnnotationControls.displayName = 'EmbedPDFAnnotationControls';

