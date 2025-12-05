import { useState, useEffect, useRef } from 'react';
import { getPDF } from '../utils/pdfStorage';
import { createPluginRegistration } from '@embedpdf/core';
import { LoaderPluginPackage } from '@embedpdf/plugin-loader/react';
import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/react';
import { ScrollPluginPackage, ScrollStrategy } from '@embedpdf/plugin-scroll/react';
import { RenderPluginPackage } from '@embedpdf/plugin-render/react';
import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/react';
import { SelectionPluginPackage } from '@embedpdf/plugin-selection/react';
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

        let pdfBlobToUse: Blob | null = null;

        if (pdfBlob) {
          pdfBlobToUse = pdfBlob;
          console.log('🔍 usePDFLoaderSecondary: Using provided PDF blob, size:', pdfBlobToUse.size);
        } else if (pdfId) {
          const pdfData = await getPDF(pdfId);
          if (pdfData?.pdf) {
            pdfBlobToUse = pdfData.pdf;
            console.log('🔍 usePDFLoaderSecondary: Loaded PDF from IndexedDB, size:', pdfBlobToUse.size);
          } else {
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
        const configuredPlugins = [
          // Essential plugins
          createPluginRegistration(LoaderPluginPackage, {}),
          
          // Register ViewportPluginPackage first (dependency for ScrollPluginPackage)
          createPluginRegistration(ViewportPluginPackage, {
            viewportGap: 10, // Adds 10px of padding inside the viewport
          }),
          
          // Register ScrollPluginPackage (depends on ViewportPluginPackage)
          createPluginRegistration(ScrollPluginPackage, {
            strategy: ScrollStrategy.Vertical, // Vertical scrolling
            initialPage: 1, // Start at page 1 (1-based index)
          }),
          
          // Register RenderPluginPackage after Viewport and Scroll (proper dependency order)
          createPluginRegistration(RenderPluginPackage),
          
          // Other plugins
          createPluginRegistration(InteractionManagerPluginPackage),
          createPluginRegistration(SelectionPluginPackage),
          createPluginRegistration(AnnotationPluginPackage),
          createPluginRegistration(ZoomPluginPackage),
          createPluginRegistration(ExportPluginPackage),
        ];

        setPlugins(configuredPlugins);
        console.log('✅ usePDFLoaderSecondary: Plugins configured with ViewportPluginPackage (viewportGap: 10) and ScrollPluginPackage (Vertical strategy, initialPage: 1)');

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

