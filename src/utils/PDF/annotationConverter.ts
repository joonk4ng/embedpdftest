// Helper functions to convert EmbedPDF annotations to metadata format
import type { AnnotationMetadata } from '../pdfStorage';

/**
 * Coordinate space context for conversion
 */
export interface CoordinateSpaceContext {
  // Rendered page dimensions (pixels) - from renderPage callback
  renderedPageWidth: number;
  renderedPageHeight: number;
  
  // PDF page dimensions (points) - from PDF document
  pdfPageWidth: number;
  pdfPageHeight: number;
  
  // Additional context
  zoomLevel?: number;
  devicePixelRatio?: number;
  scale?: number;  // From renderPage callback
}

/**
 * Convert EmbedPDF annotation state to AnnotationMetadata array
 * Now converts to PDF coordinates immediately at creation time
 */
export function convertEmbedPDFAnnotationsToMetadata(
  annotationState: any,
  pageDimensions?: Array<{ pageIndex: number; width: number; height: number }>,
  coordinateSpaceContext?: CoordinateSpaceContext | Array<{ pageIndex: number; context: CoordinateSpaceContext }>
): AnnotationMetadata[] {
  if (!annotationState) {
    return [];
  }

  const annotations: AnnotationMetadata[] = [];
  
  // Extract annotations from EmbedPDF state structure
  let embedAnnotations: any[] = [];
  
  if (annotationState.byUid) {
    embedAnnotations = Object.values(annotationState.byUid) as any[];
  } else if (annotationState.pages) {
    const pageKeys = Object.keys(annotationState.pages);
    for (const pageKey of pageKeys) {
      const pageAnnotations = annotationState.pages[pageKey];
      if (Array.isArray(pageAnnotations)) {
        embedAnnotations.push(...pageAnnotations);
      }
    }
  } else if (Array.isArray(annotationState)) {
    embedAnnotations = annotationState;
  }

  for (const ann of embedAnnotations) {
    const annotationObj = ann?.object || ann;
    const uid = ann.id || ann.uid || annotationObj.id || annotationObj.uid;
    
    // Determine annotation type
    const subtype = annotationObj?.subtype || annotationObj?.type || '';
    const typeNum = typeof annotationObj?.type === 'number' ? annotationObj.type : null;
    const hasInkList = !!(annotationObj?.inkList || ann?.inkList);
    
    let annotationType: AnnotationMetadata['type'] = 'ink';
    if (subtype === 'Text' || subtype === 'text') {
      annotationType = 'text';
    } else if (subtype === 'Highlight' || subtype === 'highlight') {
      annotationType = 'highlight';
    } else if (subtype === 'Ink' || subtype === 'ink' || typeNum === 15 || hasInkList) {
      annotationType = 'ink';
    } else if (subtype === 'Stamp' || subtype === 'stamp') {
      annotationType = 'stamp';
    }
    
    // Extract coordinates
    const coordinates: AnnotationMetadata['coordinates'] = {};
    
    // Rect property
    const rect = annotationObj?.rect || ann?.rect;
    if (rect && Array.isArray(rect) && rect.length >= 4) {
      coordinates.rect = [rect[0], rect[1], rect[2], rect[3]];
    }
    
    // Ink list for ink annotations
    const inkList = annotationObj?.inkList || ann?.inkList;
    if (inkList && Array.isArray(inkList)) {
      coordinates.inkList = inkList.map((stroke: any) => ({
        points: (stroke.points || stroke || []).map((point: any) => {
          if (typeof point === 'object' && 'x' in point && 'y' in point) {
            return { x: point.x, y: point.y };
          } else if (Array.isArray(point) && point.length >= 2) {
            return { x: point[0], y: point[1] };
          }
          return { x: 0, y: 0 };
        }).filter((p: { x: number; y: number }) => typeof p.x === 'number' && typeof p.y === 'number')
      })).filter((stroke: any) => stroke.points && stroke.points.length > 0);
    }
    
    // Text content
    if (annotationType === 'text' && annotationObj?.contents) {
      coordinates.textContent = annotationObj.contents;
      if (coordinates.rect) {
        coordinates.textPosition = {
          x: coordinates.rect[0],
          y: coordinates.rect[1]
        };
      }
    }
    
    // Extract visual properties
    const color = annotationObj?.color || ann?.color || '#000000';
    const strokeWidth = annotationObj?.strokeWidth || ann?.strokeWidth || 3;
    const opacity = annotationObj?.opacity !== undefined ? annotationObj.opacity : 1;
    
    // Determine page index
    let pageIndex = 0;
    if (annotationObj?.pageIndex !== undefined) {
      pageIndex = annotationObj.pageIndex;
    } else if (ann?.pageIndex !== undefined) {
      pageIndex = ann.pageIndex;
    } else if (pageDimensions && pageDimensions.length > 0) {
      // Try to infer from rect coordinates and page dimensions
      if (coordinates.rect) {
        const [, y] = coordinates.rect;
        for (let i = 0; i < pageDimensions.length; i++) {
          const dim = pageDimensions[i];
          if (y >= dim.height * i && y < dim.height * (i + 1)) {
            pageIndex = i;
            break;
          }
        }
      }
    }
    
    // Get coordinate space context for this page
    let context: CoordinateSpaceContext | undefined;
    if (Array.isArray(coordinateSpaceContext)) {
      const pageContext = coordinateSpaceContext.find(c => c.pageIndex === pageIndex);
      context = pageContext?.context;
    } else if (coordinateSpaceContext) {
      context = coordinateSpaceContext;
    }
    
    // Convert coordinates to PDF space immediately if context is available
    const pdfCoordinates: AnnotationMetadata['coordinates']['pdfCoordinates'] = {};
    let coordinateSpace: AnnotationMetadata['coordinateSpace'] | undefined;
    
    if (context) {
      const { renderedPageWidth, renderedPageHeight, pdfPageWidth, pdfPageHeight } = context;
      const scaleX = pdfPageWidth / renderedPageWidth;
      const scaleY = pdfPageHeight / renderedPageHeight;
      
      // Convert rect to PDF coordinates
      // CRITICAL: The rect from EmbedPDF might span the entire page (incorrect)
      // We should prefer calculating bounds from inkList points instead
      // Only use rect if it seems reasonable (not spanning entire page)
      if (coordinates.rect) {
        const [x1, y1, x2, y2] = coordinates.rect;
        const rectWidth = Math.abs(x2 - x1);
        const rectHeight = Math.abs(y2 - y1);
        
        // Check if rect seems reasonable (not spanning entire page)
        // If rect is > 80% of page, it's likely incorrect and we should use inkList bounds instead
        const isReasonableRect = rectWidth < renderedPageWidth * 0.8 && rectHeight < renderedPageHeight * 0.8;
        
        if (isReasonableRect) {
          // Convert X coordinates (straightforward)
          const pdfX1 = x1 * scaleX;
          const pdfX2 = x2 * scaleX;
          
          // Convert Y coordinates (flip from top-left to bottom-left origin)
          // In annotation space: y1/y2 are from top, Y increases downward
          // In PDF space: Y is from bottom, Y increases upward
          const pdfY1_fromTop = y1 * scaleY;
          const pdfY2_fromTop = y2 * scaleY;
          const pdfY1 = pdfPageHeight - pdfY2_fromTop; // Bottom of rect in PDF space
          const pdfY2 = pdfPageHeight - pdfY1_fromTop; // Top of rect in PDF space
          
          pdfCoordinates.rect = [pdfX1, pdfY1, pdfX2, pdfY2];
        } else {
          console.warn('⚠️ AnnotationConverter: Rect spans too large an area, will calculate from inkList instead:', {
            rect: [x1, y1, x2, y2],
            rectSize: { width: rectWidth, height: rectHeight },
            pageSize: { width: renderedPageWidth, height: renderedPageHeight },
            percentage: {
              width: (rectWidth / renderedPageWidth * 100).toFixed(1) + '%',
              height: (rectHeight / renderedPageHeight * 100).toFixed(1) + '%'
            }
          });
        }
      }
      
      // Calculate bounds from inkList points (more accurate than rect)
      if (coordinates.inkList && coordinates.inkList.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        for (const stroke of coordinates.inkList) {
          for (const point of stroke.points) {
            // Convert to PDF coordinates
            const pdfX = point.x * scaleX;
            const pdfY_fromTop = point.y * scaleY;
            const pdfY = pdfPageHeight - pdfY_fromTop;
            
            minX = Math.min(minX, pdfX);
            minY = Math.min(minY, pdfY);
            maxX = Math.max(maxX, pdfX);
            maxY = Math.max(maxY, pdfY);
          }
        }
        
        // If we calculated bounds from inkList, use those instead of rect
        if (minX !== Infinity && !pdfCoordinates.rect) {
          pdfCoordinates.rect = [minX, minY, maxX, maxY];
          console.log('✅ AnnotationConverter: Calculated PDF rect from inkList points:', pdfCoordinates.rect);
        } else if (minX !== Infinity && pdfCoordinates.rect) {
          // Compare with rect - if inkList bounds are much smaller, use those instead
          const rectWidth = Math.abs(pdfCoordinates.rect[2] - pdfCoordinates.rect[0]);
          const rectHeight = Math.abs(pdfCoordinates.rect[3] - pdfCoordinates.rect[1]);
          const inkListWidth = maxX - minX;
          const inkListHeight = maxY - minY;
          
          // If inkList bounds are < 50% of rect, use inkList (rect is likely wrong)
          if (inkListWidth < rectWidth * 0.5 || inkListHeight < rectHeight * 0.5) {
            console.log('✅ AnnotationConverter: Using inkList bounds instead of rect (rect was too large):', {
              rect: pdfCoordinates.rect,
              inkListBounds: [minX, minY, maxX, maxY],
              rectSize: { width: rectWidth, height: rectHeight },
              inkListSize: { width: inkListWidth, height: inkListHeight }
            });
            pdfCoordinates.rect = [minX, minY, maxX, maxY];
          }
        }
      }
      
      // Convert inkList to PDF coordinates
      if (coordinates.inkList && coordinates.inkList.length > 0) {
        pdfCoordinates.inkList = coordinates.inkList.map(stroke => ({
          points: stroke.points.map(point => {
            // Convert X (straightforward)
            const pdfX = point.x * scaleX;
            
            // Convert Y (flip from top-left to bottom-left origin)
            const pdfY_fromTop = point.y * scaleY;
            const pdfY = pdfPageHeight - pdfY_fromTop;
            
            return { x: pdfX, y: pdfY };
          })
        }));
      }
      
      // Convert text position to PDF coordinates
      if (coordinates.textPosition) {
        const pdfX = coordinates.textPosition.x * scaleX;
        const pdfY_fromTop = coordinates.textPosition.y * scaleY;
        const pdfY = pdfPageHeight - pdfY_fromTop;
        pdfCoordinates.textPosition = { x: pdfX, y: pdfY };
      }
      
      // Store coordinate space context
      coordinateSpace = {
        renderedPageWidth,
        renderedPageHeight,
        pdfPageWidth,
        pdfPageHeight,
        scaleX,
        scaleY,
        zoomLevel: context.zoomLevel,
        devicePixelRatio: context.devicePixelRatio,
        scale: context.scale
      };
      
      console.log('✅ AnnotationConverter: Converted coordinates to PDF space:', {
        annotationId: uid,
        pageIndex,
        pixelRect: coordinates.rect,
        pdfRect: pdfCoordinates.rect,
        scaleFactors: { scaleX, scaleY },
        pdfPageSize: { width: pdfPageWidth, height: pdfPageHeight }
      });
    } else {
      console.warn('⚠️ AnnotationConverter: No coordinate space context provided, PDF coordinates not converted');
    }
    
    const metadata: AnnotationMetadata = {
      id: uid || `ann-${Date.now()}-${Math.random()}`,
      uid: uid,
      type: annotationType,
      subtype: typeof subtype === 'string' ? subtype : undefined,
      pageIndex,
      coordinates: {
        ...coordinates,
        ...(Object.keys(pdfCoordinates).length > 0 && { pdfCoordinates })
      },
      ...(coordinateSpace && { coordinateSpace }),
      color: typeof color === 'string' ? color : undefined,
      strokeWidth: typeof strokeWidth === 'number' ? strokeWidth : undefined,
      opacity: typeof opacity === 'number' ? opacity : undefined,
      createdAt: new Date().toISOString(),
      properties: {
        // Store any additional properties
        ...(annotationObj?.author && { author: annotationObj.author }),
        ...(annotationObj?.subject && { subject: annotationObj.subject }),
      }
    };
    
    annotations.push(metadata);
  }
  
  return annotations;
}

/**
 * Convert AnnotationMetadata back to EmbedPDF-compatible format
 * (for loading annotations from metadata)
 */
export function convertMetadataToEmbedPDFFormat(
  annotations: AnnotationMetadata[]
): any {
  const byUid: Record<string, any> = {};
  
  for (const ann of annotations) {
    const uid = ann.uid || ann.id;
    
    // Reconstruct EmbedPDF annotation structure
    const embedAnnotation: any = {
      id: uid,
      uid: uid,
      type: ann.type === 'ink' ? 15 : ann.type, // PDF annotation type 15 = Ink
      subtype: ann.subtype || ann.type,
      pageIndex: ann.pageIndex,
      rect: ann.coordinates.rect,
      color: ann.color || '#000000',
      strokeWidth: ann.strokeWidth || 3,
      opacity: ann.opacity !== undefined ? ann.opacity : 1,
      createdAt: ann.createdAt,
    };
    
    // Reconstruct inkList if present
    if (ann.coordinates.inkList && ann.coordinates.inkList.length > 0) {
      embedAnnotation.inkList = ann.coordinates.inkList.map(stroke => ({
        points: stroke.points
      }));
    }
    
    // Reconstruct text content if present
    if (ann.type === 'text' && ann.coordinates.textContent) {
      embedAnnotation.contents = ann.coordinates.textContent;
    }
    
    // Add any additional properties
    if (ann.properties) {
      Object.assign(embedAnnotation, ann.properties);
    }
    
    // Wrap in object structure if needed (EmbedPDF sometimes nests in 'object')
    byUid[uid] = {
      object: embedAnnotation,
      ...embedAnnotation
    };
  }
  
  return {
    byUid,
    pages: annotations.reduce((acc, ann) => {
      const pageKey = ann.pageIndex.toString();
      if (!acc[pageKey]) {
        acc[pageKey] = [];
      }
      acc[pageKey].push(ann.uid || ann.id);
      return acc;
    }, {} as Record<string, string[]>),
    hasPendingChanges: false
  };
}

