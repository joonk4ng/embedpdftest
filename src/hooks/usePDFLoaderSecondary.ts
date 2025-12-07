import { useState, useEffect, useRef } from 'react';
import { getPDF, listPDFs } from '../utils/pdfStorage';
import { createPluginRegistration } from '@embedpdf/core';
import { LoaderPluginPackage } from '@embedpdf/plugin-loader/react';
import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/react';
import { ScrollPluginPackage, ScrollStrategy } from '@embedpdf/plugin-scroll/react';
import { RenderPluginPackage } from '@embedpdf/plugin-render/react';
import { TilingPluginPackage } from '@embedpdf/plugin-tiling/react';
import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/react';
import { SelectionPluginPackage } from '@embedpdf/plugin-selection/react';
import { HistoryPluginPackage } from '@embedpdf/plugin-history/react';
import { AnnotationPluginPackage } from '@embedpdf/plugin-annotation/react';
import { ZoomPluginPackage } from '@embedpdf/plugin-zoom/react';
import { ExportPluginPackage } from '@embedpdf/plugin-export/react';

export interface UsePDFLoaderSecondaryResult {
  pdfUrl: string | null;
  plugins: any[];
  isLoading: boolean;
  error: string | null;
  pdfDocRef: React.RefObject<any>;
}

export const usePDFLoaderSecondary = (
  pdfId?: string, 
  pdfBlob?: Blob,
  date?: string
): UsePDFLoaderSecondaryResult => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [plugins, setPlugins] = useState<any[]>([]);
  const pdfDocRef = useRef<any>(null);
  const pdfUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pdfId && !pdfBlob) {
      setError('Either pdfId or pdfBlob must be provided');
      setIsLoading(false);
      return;
    }

    const loadPDF = async () => {
      try {
        setIsLoading(true);
        setError(null);

        console.log('🔍 usePDFLoaderSecondary: Loading PDF with pdfId:', pdfId, 'date:', date);

        let pdfBlobToUse: Blob | null = null;

        if (pdfBlob) {
          pdfBlobToUse = pdfBlob;
          console.log('🔍 usePDFLoaderSecondary: Using provided PDF blob, size:', pdfBlobToUse.size);
        } else if (pdfId) {
          console.log('🔍 usePDFLoaderSecondary: Attempting to load PDF from IndexedDB with ID:', pdfId);
          
          // Debug: List all PDF IDs in IndexedDB to see what's available
          try {
            const allPdfs = await listPDFs();
            console.log('🔍 usePDFLoaderSecondary: All PDFs in IndexedDB:', allPdfs.map(p => ({ id: p.id, date: p.metadata.date })));
            console.log('🔍 usePDFLoaderSecondary: Looking for PDF ID:', pdfId);
            const matchingPdf = allPdfs.find(p => p.id === pdfId);
            if (!matchingPdf) {
              console.warn('⚠️ usePDFLoaderSecondary: PDF ID not found. Available IDs:', allPdfs.map(p => p.id));
            }
          } catch (e) {
            console.warn('⚠️ usePDFLoaderSecondary: Could not list PDFs:', e);
          }
          
          const pdfData = await getPDF(pdfId);
          if (pdfData?.pdf) {
            pdfBlobToUse = pdfData.pdf;
            console.log('✅ usePDFLoaderSecondary: Loaded PDF from IndexedDB, size:', pdfBlobToUse.size, 'metadata:', pdfData.metadata);
          } else {
            console.error('❌ usePDFLoaderSecondary: PDF not found in IndexedDB with ID:', pdfId);
            console.error('❌ usePDFLoaderSecondary: Expected ID format: federal-form-MM-DD-YY');
            throw new Error(`PDF with id ${pdfId} not found`);
          }
        }

        if (!pdfBlobToUse || pdfBlobToUse.size === 0) {
          throw new Error('PDF blob is empty or invalid');
        }

        // Create object URL for the PDF blob
        if (pdfUrlRef.current) {
          URL.revokeObjectURL(pdfUrlRef.current);
        }

        const objectUrl = URL.createObjectURL(pdfBlobToUse);
        pdfUrlRef.current = objectUrl;
        setPdfUrl(objectUrl);
        console.log('✅ usePDFLoaderSecondary: Created object URL for PDF');

        // Configure plugins with proper dependency order and configuration
        // Register dependencies first, then dependent plugins
        const effectivePdfId = pdfId || 'pdf';
        const configuredPlugins = [
          // Essential plugins - LoaderPluginPackage with loadingOptions
          createPluginRegistration(LoaderPluginPackage, {
            loadingOptions: {
              type: 'url',
              pdfFile: {
                id: effectivePdfId,
                url: objectUrl,
              },
            },
          }),
          
          // Register ViewportPluginPackage first (dependency for ScrollPluginPackage)
          createPluginRegistration(ViewportPluginPackage, {
            viewportGap: 10, // Adds 10px of padding inside the viewport
          }),
          
          // Register ScrollPluginPackage (depends on ViewportPluginPackage)
          createPluginRegistration(ScrollPluginPackage, {
            strategy: ScrollStrategy.Vertical, // Vertical scrolling
            initialPage: 1, // Start at page 1 (1-based index)
          }),
          
          // Register RenderPluginPackage (dependency for TilingPluginPackage)
          createPluginRegistration(RenderPluginPackage),
          
          // Register TilingPluginPackage after all its dependencies (Viewport, Scroll, Render)
          createPluginRegistration(TilingPluginPackage, {
            tileSize: 768, // Size of each tile in pixels
            overlapPx: 5, // Overlap between tiles to prevent seams
            extraRings: 1, // Pre-render one ring of tiles outside the viewport for smoother scrolling
          }),
          
          // Register Annotation Plugin dependencies first (required order)
          createPluginRegistration(InteractionManagerPluginPackage),
          createPluginRegistration(SelectionPluginPackage),
          createPluginRegistration(HistoryPluginPackage), // Optional but recommended for undo/redo
          
          // Register and configure the Annotation Plugin (depends on InteractionManager, Selection, History)
          createPluginRegistration(AnnotationPluginPackage, {
            // Optional: Set the author name for created annotations
            annotationAuthor: 'User',
          }),
          
          // Other plugins
          createPluginRegistration(ZoomPluginPackage),
          createPluginRegistration(ExportPluginPackage),
        ];

        setPlugins(configuredPlugins);
        console.log('✅ usePDFLoaderSecondary: Plugins configured with ViewportPluginPackage (viewportGap: 10), ScrollPluginPackage (Vertical strategy, initialPage: 1), and TilingPluginPackage (tileSize: 768, overlapPx: 5, extraRings: 1)');

        setIsLoading(false);
      } catch (err) {
        console.error('❌ usePDFLoaderSecondary: Error loading PDF:', err);
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
        setIsLoading(false);
      }
    };

    loadPDF();
  }, [pdfId, pdfBlob, date]);

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
    };
  }, []);

  return {
    pdfUrl,
    plugins,
    isLoading,
    error,
    pdfDocRef
  };
};

