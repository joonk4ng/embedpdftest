import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useAnnotation, useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { useExportCapability } from '@embedpdf/plugin-export/react';

export interface EmbedPDFAnnotationControlsRef {
  toggleInk: () => void;
  clearAnnotations: () => void;
  isInkMode: boolean;
  getAnnotations: () => any;
  exportPDF: () => Promise<Blob | null>;
  getAnnotationProvides: () => any;
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
                // Log annotation details to check their type and properties
                pageAnnotations.forEach((ann, idx) => {
                  console.log(`🔍 exportPDF: Annotation ${idx} on page ${pageIndex}:`, {
                    type: ann?.type || ann?.subtype || 'unknown',
                    id: ann?.id || ann?.uid || 'no-id',
                    hasAppearance: !!ann?.appearance,
                    isPermanent: ann?.permanent !== false, // Check if explicitly marked as temporary
                    properties: Object.keys(ann || {})
                  });
                });
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
      
      // Check annotation types and properties
      const annotationTypes: string[] = [];
      const annotationSubtypes: string[] = [];
      if (annotationState?.byUid) {
        Object.values(annotationState.byUid).forEach((ann: any) => {
          if (ann?.type) annotationTypes.push(ann.type);
          if (ann?.subtype) annotationSubtypes.push(ann.subtype);
        });
      }
      
      console.log('🔍 exportPDF: Annotation state before export:', {
        hasPendingChanges: annotationState?.hasPendingChanges,
        pagesCount: Object.keys(pagesData).length,
        annotationsCount: annotationState?.byUid ? Object.keys(annotationState.byUid).length : 0,
        allAnnotationsFound: allAnnotations.length,
        pagesWithAnnotationCounts: pagesWithAnnotations,
        selectedUid: annotationState?.selectedUid,
        annotationTypes: [...new Set(annotationTypes)],
        annotationSubtypes: [...new Set(annotationSubtypes)],
        pages: pagesData,
        byUid: annotationState?.byUid
      });
      
      // CRITICAL: Wait for annotations to be fully created and committed
      // Annotations might still be in the process of being created when export is called
      // We need to wait for hasPendingChanges to be false and ensure annotations are in the state
      console.log('🔍 exportPDF: Waiting for annotations to be fully created...');
      let waitAttempts = 0;
      const maxWaitAttempts = 20; // Wait up to 2 seconds (20 * 100ms)
      
      while (waitAttempts < maxWaitAttempts) {
        const currentHasPendingChanges = annotationState?.hasPendingChanges;
        const currentAnnotationCount = annotationState?.byUid ? Object.keys(annotationState.byUid).length : 0;
        
        if (!currentHasPendingChanges && currentAnnotationCount > 0) {
          console.log(`✅ exportPDF: Annotations ready after ${waitAttempts * 100}ms (${currentAnnotationCount} annotations)`);
          break;
        }
        
        if (waitAttempts === 0) {
          console.log('🔍 exportPDF: Waiting for annotations to be ready...', {
            hasPendingChanges: currentHasPendingChanges,
            annotationCount: currentAnnotationCount
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
        waitAttempts++;
      }
      
      // Re-check annotations after waiting
      if (annotationState?.byUid) {
        const finalAnnotationCount = Object.keys(annotationState.byUid).length;
        console.log('🔍 exportPDF: Final annotation count after waiting:', finalAnnotationCount);
        
        // Re-query annotations if we have them in state but didn't find them via getPageAnnotations
        if (finalAnnotationCount > 0 && allAnnotations.length === 0) {
          console.log('🔍 exportPDF: Re-querying annotations after wait...');
          allAnnotations = [];
          const annotationProvidesAny = annotationProvides as any;
          const pageIndices = Object.keys(annotationState.pages || {}).map(Number);
          
          for (const pageIndex of pageIndices) {
            try {
              if (typeof annotationProvidesAny.getPageAnnotations === 'function') {
                const pageAnnotationsResult = annotationProvidesAny.getPageAnnotations({ pageIndex });
                let pageAnnotations: any;
                if (pageAnnotationsResult && typeof pageAnnotationsResult.toPromise === 'function') {
                  pageAnnotations = await pageAnnotationsResult.toPromise();
                } else {
                  pageAnnotations = await pageAnnotationsResult;
                }
                
                if (Array.isArray(pageAnnotations)) {
                  allAnnotations.push(...pageAnnotations);
                  console.log(`🔍 exportPDF: Re-found ${pageAnnotations.length} annotations on page ${pageIndex}`);
                }
              }
            } catch (error) {
              console.error(`🔍 exportPDF: Error re-querying annotations for page ${pageIndex}:`, error);
            }
          }
        }
      }
      
      // CRITICAL: Capture annotations BEFORE commit (they may disappear from state after commit)
      // Store annotations from state.byUid before committing
      const annotationsBeforeCommit: any[] = [];
      if (annotationState?.byUid) {
        annotationsBeforeCommit.push(...Object.values(annotationState.byUid));
        console.log(`🔍 exportPDF: Captured ${annotationsBeforeCommit.length} annotations from state.byUid before commit`);
      }
      
      // Also combine with annotations found via getPageAnnotations
      const allAnnotationsToProcess = [...allAnnotations];
      // Add annotations from state that aren't already in allAnnotations
      annotationsBeforeCommit.forEach(ann => {
        const annId = ann.id || ann.uid;
        if (!allAnnotationsToProcess.find(a => (a.id || a.uid) === annId)) {
          allAnnotationsToProcess.push(ann);
        }
      });
      console.log(`🔍 exportPDF: Total annotations to process: ${allAnnotationsToProcess.length} (${allAnnotations.length} from getPageAnnotations, ${annotationsBeforeCommit.length} from state.byUid)`);
      
      // CRITICAL: Commit annotations to the PDF document before exporting
      // Even though autoCommit is enabled, we need to explicitly commit before export
      // to ensure all annotations are written to the PDF structure
      console.log('🔍 exportPDF: Preparing to commit annotations before export...');
      console.log('🔍 exportPDF: Annotation state before commit:', {
        hasPendingChanges: annotationState?.hasPendingChanges,
        annotationsCount: annotationState?.byUid ? Object.keys(annotationState.byUid).length : 0,
        pagesWithAnnotations: pagesWithAnnotations,
        allAnnotationsFound: allAnnotations.length,
        annotationsToProcess: allAnnotationsToProcess.length
      });
      
      // Try multiple commit methods to ensure annotations are saved
      let commitSuccess = false;
      
      // Method 1: Use annotationApi.commit() (preferred)
      if (annotationApi && typeof annotationApi.commit === 'function') {
        try {
          console.log('🔍 exportPDF: Committing annotations using annotationApi.commit()...');
          const commitResult = annotationApi.commit();
          // Handle Task (has toPromise method) or Promise
          if (commitResult && typeof commitResult.toPromise === 'function') {
            await commitResult.toPromise();
          } else if (commitResult && typeof (commitResult as any).then === 'function') {
            await (commitResult as any);
          }
          commitSuccess = true;
          console.log('✅ exportPDF: Annotations committed successfully via annotationApi');
        } catch (commitError) {
          console.error('❌ exportPDF: Error committing via annotationApi:', commitError);
        }
      }
      
      // Method 2: Try annotationProvides.commit() (fallback)
      if (!commitSuccess && annotationProvides) {
        const annotationProvidesAny = annotationProvides as any;
        if (typeof annotationProvidesAny.commit === 'function') {
          try {
            console.log('🔍 exportPDF: Committing annotations using annotationProvides.commit()...');
            const commitResult = annotationProvidesAny.commit();
            if (commitResult && typeof commitResult.then === 'function') {
              await commitResult;
            } else if (commitResult && typeof commitResult.toPromise === 'function') {
              await commitResult.toPromise();
            }
            commitSuccess = true;
            console.log('✅ exportPDF: Annotations committed successfully via annotationProvides');
          } catch (commitError) {
            console.error('❌ exportPDF: Error committing via annotationProvides:', commitError);
          }
        }
      }
      
      // Method 3: Try forceCommit or flush methods
      if (!commitSuccess) {
        const annotationProvidesAny = annotationProvides as any;
        if (typeof annotationProvidesAny.forceCommit === 'function') {
          try {
            console.log('🔍 exportPDF: Trying forceCommit()...');
            await annotationProvidesAny.forceCommit();
            commitSuccess = true;
            console.log('✅ exportPDF: Annotations committed via forceCommit');
          } catch (error) {
            console.warn('⚠️ exportPDF: forceCommit failed:', error);
          }
        } else if (typeof annotationProvidesAny.flush === 'function') {
          try {
            console.log('🔍 exportPDF: Trying flush()...');
            await annotationProvidesAny.flush();
            commitSuccess = true;
            console.log('✅ exportPDF: Annotations flushed');
          } catch (error) {
            console.warn('⚠️ exportPDF: flush failed:', error);
          }
        }
      }
      
      if (!commitSuccess) {
        console.warn('⚠️ exportPDF: Could not commit annotations - no commit method available');
        console.warn('⚠️ exportPDF: Annotations may not be saved in exported PDF!');
      }
      
      // CRITICAL: Wait longer after commit to ensure the engine has fully processed the changes
      // The engine needs time to write annotations to the PDF document structure
      console.log('🔍 exportPDF: Waiting for engine to process committed annotations...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Increased wait time
      
      // Verify annotations are still present after commit
      if (annotationState?.byUid) {
        const annotationCountAfterCommit = Object.keys(annotationState.byUid).length;
        console.log('🔍 exportPDF: Annotation count after commit:', annotationCountAfterCommit);
        if (annotationCountAfterCommit === 0 && allAnnotations.length > 0) {
          console.error('❌ exportPDF: WARNING - All annotations disappeared after commit!');
        }
      }
      
      // DIAGNOSTIC: Check all available methods for appearance stream generation
      console.log('🔍 DIAGNOSTIC: Checking all available methods...');
      
      // Check annotationProvides
      if (annotationProvides) {
        const providesAny = annotationProvides as any;
        console.log('🔍 DIAGNOSTIC: annotationProvides methods:', Object.keys(providesAny));
        console.log('🔍 DIAGNOSTIC: annotationProvides full object:', providesAny);
        
        // Check for any method containing "appearance", "stream", "flatten", "render"
        const appearanceMethods = Object.keys(providesAny).filter(key => 
          /appearance|stream|flatten|render|generate|update/i.test(key)
        );
        console.log('🔍 DIAGNOSTIC: annotationProvides methods related to appearance/stream/flatten:', appearanceMethods);
      }
      
      // Check annotationApi
      if (annotationApi) {
        const apiAny = annotationApi as any;
        console.log('🔍 DIAGNOSTIC: annotationApi methods:', Object.keys(apiAny));
        const appearanceMethods = Object.keys(apiAny).filter(key => 
          /appearance|stream|flatten|render|generate|update/i.test(key)
        );
        console.log('🔍 DIAGNOSTIC: annotationApi appearance-related methods:', appearanceMethods);
      }
      
      // Check exportProvides
      if (exportProvides) {
        const exportAny = exportProvides as any;
        console.log('🔍 DIAGNOSTIC: exportProvides methods:', Object.keys(exportAny));
        const appearanceMethods = Object.keys(exportAny).filter(key => 
          /appearance|stream|flatten|render|generate|update/i.test(key)
        );
        console.log('🔍 DIAGNOSTIC: exportProvides appearance-related methods:', appearanceMethods);
      }
      
      // Check engine
      if (engineRef?.current) {
        const engine = engineRef.current;
        console.log('🔍 DIAGNOSTIC: engine methods:', Object.keys(engine));
        const appearanceMethods = Object.keys(engine).filter(key => 
          /appearance|stream|flatten|render|generate|update/i.test(key)
        );
        console.log('🔍 DIAGNOSTIC: engine appearance-related methods:', appearanceMethods);
        
        // Also check if engine has nested objects with methods
        Object.keys(engine).forEach(key => {
          const value = (engine as any)[key];
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            const nestedMethods = Object.keys(value).filter(nestedKey => 
              typeof value[nestedKey] === 'function'
            );
            if (nestedMethods.length > 0) {
              console.log(`🔍 DIAGNOSTIC: engine.${key} methods:`, nestedMethods);
              const appearanceNested = nestedMethods.filter(nestedKey => 
                /appearance|stream|flatten|render|generate|update/i.test(nestedKey)
              );
              if (appearanceNested.length > 0) {
                console.log(`🔍 DIAGNOSTIC: engine.${key} appearance-related methods:`, appearanceNested);
              }
            }
          }
        });
      }
      
      // CRITICAL: Ensure annotations have appearance streams before export
      // Found updateAnnotation and renderAnnotation methods - try using them
      // Use the annotations we captured BEFORE commit (they may have disappeared from state after commit)
      if (annotationProvides && allAnnotationsToProcess.length > 0) {
        const annotationProvidesAny = annotationProvides as any;
        try {
          console.log(`🔍 exportPDF: Attempting to update/render ${allAnnotationsToProcess.length} annotations for appearance streams...`);
          
          // Try updateAnnotation for each annotation
          if (typeof annotationProvidesAny.updateAnnotation === 'function') {
            console.log(`🔍 exportPDF: Updating ${allAnnotationsToProcess.length} annotations using updateAnnotation...`);
            for (const annotation of allAnnotationsToProcess) {
              try {
                const annId = annotation.id || annotation.uid || 'unknown';
                console.log(`🔍 exportPDF: Updating annotation ${annId}...`);
                const updateResult = annotationProvidesAny.updateAnnotation(annotation);
                if (updateResult && typeof updateResult.toPromise === 'function') {
                  await updateResult.toPromise();
                } else if (updateResult && typeof updateResult.then === 'function') {
                  await updateResult;
                }
                console.log(`✅ exportPDF: Updated annotation ${annId}`);
              } catch (updateError) {
                console.warn(`⚠️ exportPDF: Error updating annotation ${annotation.id || annotation.uid}:`, updateError);
              }
            }
          }
          
          // Try renderAnnotation for each annotation
          if (typeof annotationProvidesAny.renderAnnotation === 'function') {
            console.log(`🔍 exportPDF: Rendering ${allAnnotationsToProcess.length} annotations using renderAnnotation...`);
            for (const annotation of allAnnotationsToProcess) {
              try {
                const annId = annotation.id || annotation.uid || 'unknown';
                console.log(`🔍 exportPDF: Rendering annotation ${annId}...`);
                const renderResult = annotationProvidesAny.renderAnnotation(annotation);
                if (renderResult && typeof renderResult.toPromise === 'function') {
                  await renderResult.toPromise();
                } else if (renderResult && typeof renderResult.then === 'function') {
                  await renderResult;
                }
                console.log(`✅ exportPDF: Rendered annotation ${annId}`);
              } catch (renderError) {
                console.warn(`⚠️ exportPDF: Error rendering annotation ${annotation.id || annotation.uid}:`, renderError);
              }
            }
          }
          
          // Also try the old methods as fallback
          if (typeof annotationProvidesAny.updateAppearances === 'function') {
            console.log('🔍 exportPDF: Updating annotation appearances...');
            await annotationProvidesAny.updateAppearances();
            console.log('✅ exportPDF: Annotation appearances updated');
          } else if (typeof annotationProvidesAny.generateAppearances === 'function') {
            console.log('🔍 exportPDF: Generating annotation appearances...');
            await annotationProvidesAny.generateAppearances();
            console.log('✅ exportPDF: Annotation appearances generated');
          } else {
            console.log('🔍 exportPDF: No global appearance update method found');
          }
        } catch (appearanceError) {
          console.warn('⚠️ exportPDF: Could not update annotation appearances:', appearanceError);
        }
      } else {
        console.warn(`⚠️ exportPDF: No annotations found to update/render (allAnnotationsToProcess.length: ${allAnnotationsToProcess.length})`);
      }
      
      console.log('✅ exportPDF: Commit process complete, proceeding with export');
      
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
        let pdfBlob: Blob;
        if (pdfBytes instanceof ArrayBuffer) {
          console.log('🔍 exportPDF: Creating Blob from ArrayBuffer');
          pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        } else if (pdfBytes instanceof Uint8Array) {
          console.log('🔍 exportPDF: Creating Blob from Uint8Array');
          // Create a new Uint8Array to ensure we have a proper copy
          const bytes = new Uint8Array(pdfBytes);
          pdfBlob = new Blob([bytes], { type: 'application/pdf' });
        } else {
          console.warn('🔍 exportPDF: Unexpected return type from saveAsCopy:', typeof pdfBytes);
          // Try to convert to ArrayBuffer if it's something else
          const arrayBuffer = await pdfBytes;
          pdfBlob = new Blob([arrayBuffer], { type: 'application/pdf' });
        }
        
        // Verify the exported PDF contains annotations by checking the PDF structure
        try {
          console.log('🔍 exportPDF: Verifying exported PDF contains annotations...');
          const pdfText = await pdfBlob.text();
          // Check if PDF contains annotation markers (Annots, /Subtype /Ink, etc.)
          const hasAnnots = pdfText.includes('/Annots') || pdfText.includes('/Subtype') || pdfText.includes('/Ink');
          console.log('🔍 exportPDF: Exported PDF contains annotation markers:', hasAnnots);
          if (!hasAnnots && allAnnotations.length > 0) {
            console.error('❌ exportPDF: WARNING - Exported PDF does not appear to contain annotations!');
            console.error('❌ exportPDF: This means annotations were not saved to the PDF.');
          } else if (hasAnnots) {
            console.log('✅ exportPDF: Exported PDF appears to contain annotations');
          }
        } catch (verifyError) {
          console.warn('⚠️ exportPDF: Could not verify PDF annotations:', verifyError);
        }
        
        return pdfBlob;
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
    exportPDF,
    getAnnotationProvides: () => {
      // Return annotation provides for direct access
      return annotationProvides;
    }
  }));

  // This component doesn't render anything visible - it just provides controls
  return null;
});

EmbedPDFAnnotationControls.displayName = 'EmbedPDFAnnotationControls';

