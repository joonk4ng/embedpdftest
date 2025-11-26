// Helper functions to convert EmbedPDF annotations to metadata format
import type { AnnotationMetadata } from '../pdfStorage';

/**
 * Convert EmbedPDF annotation state to AnnotationMetadata array
 */
export function convertEmbedPDFAnnotationsToMetadata(
  annotationState: any,
  pageDimensions?: Array<{ pageIndex: number; width: number; height: number }>
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
    
    const metadata: AnnotationMetadata = {
      id: uid || `ann-${Date.now()}-${Math.random()}`,
      uid: uid,
      type: annotationType,
      subtype: typeof subtype === 'string' ? subtype : undefined,
      pageIndex,
      coordinates,
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

