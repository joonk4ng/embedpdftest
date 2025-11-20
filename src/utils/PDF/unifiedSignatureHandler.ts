// Unified signature handler for elegantly combining EmbedPDF annotations with pdf-lib
import * as PDFLib from 'pdf-lib';

/**
 * Signature bounds in viewport coordinates (pixels)
 */
export interface SignatureBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/**
 * Signature position in PDF coordinates (points)
 */
export interface SignaturePosition {
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex: number; // 0-based page index
}

/**
 * Ink annotation path (array of points)
 */
export interface InkPath {
  points: Array<{ x: number; y: number }>;
}

/**
 * Extract signature bounds from EmbedPDF annotation state
 */
export function extractSignatureBounds(annotationState: any): SignatureBounds | null {
  if (!annotationState) {
    console.log('🔍 extractSignatureBounds: No annotation state provided');
    return null;
  }

  // Try different possible structures
  let annotations: any[] = [];
  
  if (annotationState.byUid) {
    annotations = Object.values(annotationState.byUid) as any[];
    console.log('🔍 extractSignatureBounds: Found annotations in byUid:', annotations.length);
  } else if (annotationState.pages) {
    // Try getting annotations from pages
    const pageKeys = Object.keys(annotationState.pages);
    for (const pageKey of pageKeys) {
      const pageAnnotations = annotationState.pages[pageKey];
      if (Array.isArray(pageAnnotations)) {
        annotations.push(...pageAnnotations);
      }
    }
    console.log('🔍 extractSignatureBounds: Found annotations in pages:', annotations.length);
  } else if (Array.isArray(annotationState)) {
    annotations = annotationState;
    console.log('🔍 extractSignatureBounds: Annotation state is array:', annotations.length);
  } else {
    console.warn('🔍 extractSignatureBounds: Unknown annotation state structure:', Object.keys(annotationState));
    return null;
  }

  const inkAnnotations = annotations.filter((ann) => {
    // Check if annotation has an 'object' property (nested structure)
    const annotationObj = ann?.object || ann;
    const subtype = annotationObj?.subtype || annotationObj?.type || '';
    const typeNum = typeof annotationObj?.type === 'number' ? annotationObj.type : null;
    // Type 15 is Ink annotation in PDF spec, or check for inkList property
    const hasInkList = !!(annotationObj?.inkList || ann?.inkList);
    const isInk = subtype === 'Ink' || subtype === 'ink' || 
                  annotationObj?.type === 'ink' || 
                  typeNum === 15 || 
                  hasInkList;
    
    if (isInk) {
      console.log('🔍 extractSignatureBounds: Found ink annotation:', {
        subtype: annotationObj?.subtype,
        type: annotationObj?.type,
        typeNum,
        hasPaths: !!annotationObj?.paths,
        hasInkList: hasInkList,
        hasRect: !!annotationObj?.rect,
        keys: Object.keys(annotationObj || {}),
        fullAnnotation: ann
      });
    }
    return isInk;
  });

  if (inkAnnotations.length === 0) {
    console.log('🔍 extractSignatureBounds: No ink annotations found. Total annotations:', annotations.length);
    if (annotations.length > 0) {
      console.log('🔍 extractSignatureBounds: Annotation types found:', annotations.map(a => a?.subtype || a?.type || 'unknown'));
    }
    return null;
  }

  console.log(`🔍 extractSignatureBounds: Found ${inkAnnotations.length} ink annotation(s)`);

  // Collect all points from all ink annotations
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const annotation of inkAnnotations) {
    // Get the actual annotation object (might be nested in 'object' property)
    const annotationObj = annotation?.object || annotation;
    
    // Check rect property first - it might tell us the coordinate space
    const rect = annotationObj?.rect || annotation?.rect;
    if (rect && Array.isArray(rect) && rect.length >= 4) {
      const [x1, y1, x2, y2] = rect;
      console.log('🔍 extractSignatureBounds: Annotation rect property:', { 
        x1, y1, x2, y2, 
        width: Math.abs(x2 - x1), 
        height: Math.abs(y2 - y1),
        likelyPdfSpace: Math.abs(x2 - x1) > 500 || Math.abs(y2 - y1) > 500
      });
    }
    
    // EmbedPDF ink annotations have inkList property which is an array of stroke objects
    // Each stroke object has a 'points' array
    const inkList = annotationObj?.inkList || annotation?.inkList || [];
    
    console.log('🔍 extractSignatureBounds: Processing ink annotation, inkList length:', inkList.length);
    
    // Log first few points to understand coordinate space
    if (inkList.length > 0 && inkList[0]?.points && inkList[0].points.length > 0) {
      const firstPoint = inkList[0].points[0];
      console.log('🔍 extractSignatureBounds: First point sample:', firstPoint, {
        xType: typeof firstPoint?.x,
        yType: typeof firstPoint?.y,
        xValue: firstPoint?.x,
        yValue: firstPoint?.y
      });
    }
    
    if (!Array.isArray(inkList)) {
      console.warn('🔍 extractSignatureBounds: inkList is not an array:', inkList);
      continue;
    }

    // Process each stroke in the inkList
    for (const stroke of inkList) {
      if (!stroke || typeof stroke !== 'object') {
        continue;
      }
      
      // Each stroke has a 'points' array
      const points = stroke.points || stroke;
      
      if (!Array.isArray(points)) {
        console.warn('🔍 extractSignatureBounds: Stroke points is not an array:', points);
        continue;
      }

      // Process each point in the stroke
      for (const point of points) {
        if (point && typeof point.x === 'number' && typeof point.y === 'number') {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        } else if (Array.isArray(point) && point.length >= 2) {
          // Point might be [x, y] array
          minX = Math.min(minX, point[0]);
          minY = Math.min(minY, point[1]);
          maxX = Math.max(maxX, point[0]);
          maxY = Math.max(maxY, point[1]);
        }
      }
    }

    // Also check rect property if available (might be on annotationObj or annotation)
    // The rect property might be in PDF coordinate space already
    const rect = annotationObj?.rect || annotation?.rect;
    if (rect && Array.isArray(rect) && rect.length >= 4) {
      const [x1, y1, x2, y2] = rect;
      console.log('🔍 extractSignatureBounds: Found rect property:', { x1, y1, x2, y2, rect });
      // Check if rect coordinates are in PDF space (typically larger values, like 0-792 for height)
      // vs annotation space (typically smaller pixel values)
      const rectWidth = Math.abs(x2 - x1);
      const rectHeight = Math.abs(y2 - y1);
      const isLikelyPdfSpace = rectWidth > 500 || rectHeight > 500; // PDF points are typically 500-800 range
      
      if (isLikelyPdfSpace) {
        console.log('🔍 extractSignatureBounds: Rect appears to be in PDF coordinate space, using it directly');
        // Rect is in PDF space, use it directly but we still need to extract from inkList for rendering
        // Store rect separately for coordinate conversion
        (annotation as any)._pdfRect = rect;
      } else {
        // Rect is in annotation space, include in bounds calculation
        minX = Math.min(minX, x1, x2);
        minY = Math.min(minY, y1, y2);
        maxX = Math.max(maxX, x1, x2);
        maxY = Math.max(maxY, y1, y2);
      }
    }
  }

  if (minX === Infinity || minY === Infinity) {
    console.warn('🔍 extractSignatureBounds: Could not determine signature bounds');
    return null;
  }

  const bounds: SignatureBounds = {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };

  console.log('🔍 extractSignatureBounds: Signature bounds:', bounds);
  console.log('🔍 extractSignatureBounds: Coordinate space analysis:', {
    bounds,
    // Check if coordinates seem reasonable for annotation space (typically 0-1000px range)
    // vs PDF space (typically 0-800pt range)
    likelyAnnotationSpace: maxX < 2000 && maxY < 2000,
    likelyPdfSpace: maxX > 500 || maxY > 500,
    coordinateRange: {
      xRange: `0-${maxX.toFixed(1)}`,
      yRange: `0-${maxY.toFixed(1)}`
    }
  });
  
  return bounds;
}

/**
 * Render ink paths to a high-resolution canvas
 */
export function renderInkPathsToCanvas(
  annotationState: any,
  bounds: SignatureBounds,
  scale: number = 3.0
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  
  // Add padding around signature
  const padding = 20;
  const canvasWidth = Math.ceil((bounds.width + padding * 2) * scale);
  const canvasHeight = Math.ceil((bounds.height + padding * 2) * scale);
  
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Fill with transparent background
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Configure drawing context
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3 * scale;
  ctx.strokeStyle = '#000000';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Get ink annotations
  const annotations = Object.values(annotationState.byUid || {}) as any[];
  const inkAnnotations = annotations.filter((ann) => {
    const annotationObj = ann?.object || ann;
    const typeNum = typeof annotationObj?.type === 'number' ? annotationObj.type : null;
    const hasInkList = !!(annotationObj?.inkList || ann?.inkList);
    return typeNum === 15 || hasInkList;
  });

  // Offset to account for padding and bounds
  const offsetX = -bounds.minX + padding;
  const offsetY = -bounds.minY + padding;

  // Render each annotation
  for (const annotation of inkAnnotations) {
    const annotationObj = annotation?.object || annotation;
    const inkList = annotationObj?.inkList || annotation?.inkList || [];
    
    if (!Array.isArray(inkList)) {
      continue;
    }

    // Get stroke properties from annotation
    const strokeWidth = annotationObj?.strokeWidth || 6;
    const color = annotationObj?.color || '#000000';
    const opacity = annotationObj?.opacity !== undefined ? annotationObj.opacity : 1;
    
    // Set stroke style
    ctx.lineWidth = strokeWidth * scale;
    ctx.strokeStyle = color;
    ctx.globalAlpha = opacity;

    // Process each stroke in the inkList
    for (const stroke of inkList) {
      if (!stroke || typeof stroke !== 'object') {
        continue;
      }
      
      const points = stroke.points || stroke;
      
      if (!Array.isArray(points) || points.length === 0) {
        continue;
      }

      ctx.beginPath();
      let firstPoint = true;

      for (const point of points) {
        let x: number, y: number;
        
        if (point && typeof point.x === 'number' && typeof point.y === 'number') {
          x = (point.x + offsetX) * scale;
          y = (point.y + offsetY) * scale;
        } else if (Array.isArray(point) && point.length >= 2) {
          x = (point[0] + offsetX) * scale;
          y = (point[1] + offsetY) * scale;
        } else {
          continue;
        }

        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    }
  }

  return canvas;
}

/**
 * Extract signature as image from EmbedPDF annotation state
 */
export async function extractSignatureFromEmbedPDF(
  annotationState: any,
  scale: number = 3.0
): Promise<{ image: Blob; bounds: SignatureBounds } | null> {
  console.log('🔍 extractSignatureFromEmbedPDF: Starting signature extraction...');

  const bounds = extractSignatureBounds(annotationState);
  if (!bounds) {
    console.log('🔍 extractSignatureFromEmbedPDF: No signature bounds found');
    return null;
  }

  // Render signature to canvas
  const canvas = renderInkPathsToCanvas(annotationState, bounds, scale);
  
  // Convert canvas to blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to convert signature canvas to blob'));
      }
    }, 'image/png', 1.0);
  });

  console.log('🔍 extractSignatureFromEmbedPDF: Signature extracted successfully');
  return { image: blob, bounds };
}

/**
 * Calculate signature position in PDF coordinate space (points)
 * 
 * @param signatureBounds - Signature bounds in annotation layer coordinates (pixels)
 * @param pdfPage - PDF page object
 * @param renderedPageWidth - Actual rendered page width in pixels (annotation coordinate space)
 * @param renderedPageHeight - Actual rendered page height in pixels (annotation coordinate space)
 * @param pageIndex - Page index (0-based)
 */
export function calculateSignaturePosition(
  signatureBounds: SignatureBounds,
  pdfPage: PDFLib.PDFPage,
  renderedPageWidth: number,
  renderedPageHeight: number,
  pageIndex: number = 0,
  annotationRect?: number[] // Optional: rect property from annotation (might be in PDF space)
): SignaturePosition {
  // Get PDF page dimensions in points (native PDF coordinate system)
  const { width: pdfWidth, height: pdfHeight } = pdfPage.getSize();
  
  // If annotation rect is provided and appears to be in PDF coordinate space, use it directly
  if (annotationRect && Array.isArray(annotationRect) && annotationRect.length >= 4) {
    const [x1, y1, x2, y2] = annotationRect;
    const rectWidth = Math.abs(x2 - x1);
    const rectHeight = Math.abs(y2 - y1);
    const isLikelyPdfSpace = rectWidth > 500 || rectHeight > 500; // PDF points are typically 500-800 range
    
    if (isLikelyPdfSpace) {
      console.log('🔍 calculateSignaturePosition: Using annotation rect (PDF coordinate space):', { x1, y1, x2, y2 });
      // Rect is in PDF coordinate space
      // PDF coordinate system: bottom-left origin, Y increases upward
      // Rect coordinates: [x1, y1, x2, y2] where y1/y2 are from bottom
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      
      // The rect gives us the bounds in PDF space
      // We need to position the signature image at the bottom-left corner
      // The rect's minY is the bottom of the signature in PDF space
      return {
        x: minX,
        y: minY, // Bottom-left Y in PDF space
        width: maxX - minX,
        height: maxY - minY,
        pageIndex,
      };
    }
  }
  
  // Calculate scale factors from rendered pixels to PDF points
  // Annotation coordinates are in pixels relative to the rendered page
  // PDF coordinates are in points (1/72 inch)
  const scaleX = pdfWidth / renderedPageWidth;
  const scaleY = pdfHeight / renderedPageHeight;
  
  console.log('🔍 calculateSignaturePosition: Coordinate conversion:', {
    renderedPage: { width: renderedPageWidth, height: renderedPageHeight },
    pdfPage: { width: pdfWidth, height: pdfHeight },
    scaleFactors: { scaleX, scaleY },
    signatureBounds,
    // Calculate what percentage of page the signature is at
    signaturePercentFromTop: {
      x: (signatureBounds.minX / renderedPageWidth * 100).toFixed(1) + '%',
      y: (signatureBounds.minY / renderedPageHeight * 100).toFixed(1) + '%'
    }
  });
  
  // Convert signature bounds from annotation layer coordinates (pixels) to PDF coordinates (points)
  // PDF coordinate system: origin at bottom-left, Y increases upward
  // Annotation coordinate system: origin at top-left, Y increases downward
  const pdfX = signatureBounds.minX * scaleX;
  
  // Flip Y coordinate: annotation Y=0 is at top, PDF Y=0 is at bottom
  // pdf-lib's drawImage positions the image with bottom-left corner at (x, y)
  // In annotation space: minY is the top of the signature (distance from top)
  // In PDF space: we need the bottom-left corner of the image
  // The signature's top in annotation space should align with the top of the image in PDF space
  // So: pdfY = pdfHeight - (minY * scaleY) - (signatureHeight * scaleY)
  // This positions the bottom-left corner so the top of the image is at the correct position
  const signatureTopInPdf = signatureBounds.minY * scaleY;
  const signatureHeightInPdf = signatureBounds.height * scaleY;
  let pdfY = pdfHeight - signatureTopInPdf - signatureHeightInPdf;
  
  // No adjustment - use calculated Y directly to debug coordinate mismatch
  const adjustedPdfY = pdfY;
  
  const pdfWidth_scaled = signatureBounds.width * scaleX;
  const pdfHeight_scaled = signatureBounds.height * scaleY;
  
  const position: SignaturePosition = {
    x: pdfX,
    y: adjustedPdfY,
    width: pdfWidth_scaled,
    height: pdfHeight_scaled,
    pageIndex,
  };
  
  // Calculate what percentage from top/bottom the signature should be at
  const annotationPercentFromTop = (signatureBounds.minY / renderedPageHeight) * 100;
  const pdfPercentFromTop = ((pdfHeight - adjustedPdfY - signatureHeightInPdf) / pdfHeight) * 100;
  const pdfPercentFromBottom = (adjustedPdfY / pdfHeight) * 100;
  
  console.log('🔍 calculateSignaturePosition: Final position:', {
    annotationBounds: signatureBounds,
    pdfPosition: position,
    conversion: {
      annotationToPdfX: `${signatureBounds.minX}px → ${pdfX}pt`,
      annotationTopY: `${signatureBounds.minY}px → ${signatureTopInPdf.toFixed(2)}pt from top in PDF`,
      annotationBottomY: `${signatureBounds.maxY}px → ${(signatureBounds.maxY * scaleY).toFixed(2)}pt from top in PDF`,
      calculatedPdfY: `${pdfY.toFixed(2)}pt (bottom-left corner Y)`,
      adjustedPdfY: `${adjustedPdfY.toFixed(2)}pt (final Y)`,
      signatureHeightInPdf: `${signatureHeightInPdf.toFixed(2)}pt`,
      scaleX: scaleX.toFixed(4),
      scaleY: scaleY.toFixed(4),
      pdfHeight,
      // Position analysis
      annotationPosition: {
        percentFromTop: annotationPercentFromTop.toFixed(1) + '%',
        percentFromBottom: (100 - annotationPercentFromTop).toFixed(1) + '%'
      },
      pdfPosition: {
        percentFromTop: pdfPercentFromTop.toFixed(1) + '%',
        percentFromBottom: pdfPercentFromBottom.toFixed(1) + '%',
        topEdgeY: (pdfHeight - adjustedPdfY - signatureHeightInPdf).toFixed(2) + 'pt',
        bottomEdgeY: adjustedPdfY.toFixed(2) + 'pt'
      },
      // Check if positions match
      positionMatch: Math.abs(annotationPercentFromTop - pdfPercentFromTop) < 1 ? '✅ MATCH' : '❌ MISMATCH'
    }
  });
  
  return position;
}

/**
 * Embed signature into PDF using pdf-lib
 */
export async function embedSignatureIntoPDF(
  pdfBytes: Uint8Array | ArrayBuffer,
  signatureImage: Blob,
  position: SignaturePosition,
  flatten: boolean = true
): Promise<Uint8Array> {
  console.log('🔍 embedSignatureIntoPDF: Starting signature embedding...');
  
  // Load PDF
  const arrayBuffer = pdfBytes instanceof ArrayBuffer ? pdfBytes : pdfBytes.buffer;
  const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
  
  // Get the target page
  const pages = pdfDoc.getPages();
  if (position.pageIndex >= pages.length) {
    throw new Error(`Page index ${position.pageIndex} is out of range (PDF has ${pages.length} pages)`);
  }
  
  const page = pages[position.pageIndex];
  
  // Embed signature image
  const signatureBytes = await signatureImage.arrayBuffer();
  const signaturePng = await pdfDoc.embedPng(signatureBytes);
  
  console.log('🔍 embedSignatureIntoPDF: Signature PNG dimensions:', {
    width: signaturePng.width,
    height: signaturePng.height,
  });
  console.log('🔍 embedSignatureIntoPDF: PDF page dimensions:', page.getSize());
  console.log('🔍 embedSignatureIntoPDF: Embedding at position:', position);
  
  // Draw signature on page
  // Note: pdf-lib uses bottom-left origin, so Y coordinate is already adjusted
  page.drawImage(signaturePng, {
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height,
  });
  
  // Flatten form if requested
  if (flatten) {
    try {
      const form = pdfDoc.getForm();
      form.flatten();
      console.log('🔍 embedSignatureIntoPDF: Form flattened successfully');
    } catch (error) {
      console.warn('🔍 embedSignatureIntoPDF: Could not flatten form (may not have form fields):', error);
    }
  }
  
  // Save and return
  const flattenedBytes = await pdfDoc.save();
  console.log('🔍 embedSignatureIntoPDF: Signature embedded successfully');
  
  return flattenedBytes;
}

/**
 * Main function: Extract signature from EmbedPDF and embed into PDF
 */
export async function savePDFWithEmbedPDFSignature(
  originalPdfBytes: Uint8Array | ArrayBuffer,
  annotationState: any,
  renderedPageWidth: number,
  renderedPageHeight: number,
  pageIndex: number = 0,
  flatten: boolean = true
): Promise<Uint8Array> {
  console.log('🔍 savePDFWithEmbedPDFSignature: Starting unified signature save...');
  
  // Step 1: Extract signature from EmbedPDF annotations
  const signatureData = await extractSignatureFromEmbedPDF(annotationState);
  if (!signatureData) {
    console.warn('🔍 savePDFWithEmbedPDFSignature: No signature found, returning original PDF');
    // Return original PDF if no signature
    const arrayBuffer = originalPdfBytes instanceof ArrayBuffer ? originalPdfBytes : originalPdfBytes.buffer;
    const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
    if (flatten) {
      try {
        const form = pdfDoc.getForm();
        form.flatten();
      } catch (error) {
        // Ignore flatten errors
      }
    }
    return await pdfDoc.save();
  }
  
  // Step 2: Load PDF to get page for coordinate calculation
  const arrayBuffer = originalPdfBytes instanceof ArrayBuffer ? originalPdfBytes : originalPdfBytes.buffer;
  const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
  const pages = pdfDoc.getPages();
  if (pageIndex >= pages.length) {
    throw new Error(`Page index ${pageIndex} is out of range`);
  }
  const page = pages[pageIndex];
  
  // Step 3: Get annotation rect if available (might be in PDF coordinate space)
  let annotationRect: number[] | undefined;
  if (annotationState?.byUid) {
    const annotations = Object.values(annotationState.byUid) as any[];
    const inkAnnotations = annotations.filter((ann) => {
      const annotationObj = ann?.object || ann;
      const typeNum = typeof annotationObj?.type === 'number' ? annotationObj.type : null;
      const hasInkList = !!(annotationObj?.inkList || ann?.inkList);
      return typeNum === 15 || hasInkList;
    });
    
    if (inkAnnotations.length > 0) {
      const annotationObj = inkAnnotations[0]?.object || inkAnnotations[0];
      const rect = annotationObj?.rect || inkAnnotations[0]?.rect;
      if (rect && Array.isArray(rect) && rect.length >= 4) {
        annotationRect = rect;
        console.log('🔍 savePDFWithEmbedPDFSignature: Found annotation rect:', rect);
      }
    }
  }
  
  // Step 4: Calculate signature position in PDF coordinates
  const position = calculateSignaturePosition(
    signatureData.bounds,
    page,
    renderedPageWidth,
    renderedPageHeight,
    pageIndex,
    annotationRect
  );
  
  // Step 5: Embed signature into PDF
  const signedPdfBytes = await embedSignatureIntoPDF(
    originalPdfBytes,
    signatureData.image,
    position,
    flatten
  );
  
  console.log('🔍 savePDFWithEmbedPDFSignature: Unified signature save complete');
  return signedPdfBytes;
}

