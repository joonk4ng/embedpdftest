import { useEffect } from 'react';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';

/**
 * Non-visual component that listens to annotation lifecycle events
 * Useful for saving annotation data to backend or synchronizing with external data store
 */
export const EmbedPDFAnnotationEventListener: React.FC<{
  onAnnotationEvent?: (event: any) => void;
}> = ({ onAnnotationEvent }) => {
  const { provides: annotationApi } = useAnnotationCapability();

  useEffect(() => {
    if (!annotationApi) return;

    const unsubscribe = annotationApi.onAnnotationEvent((event: any) => {
      console.log(`🔍 Annotation event: ${event.type}`, event);

      // Call custom handler if provided
      if (onAnnotationEvent) {
        onAnnotationEvent(event);
      }

      // Example: Save to backend after a change is committed to the engine
      if (event.type === 'create' && (event as any).committed) {
        // Example: yourApi.saveAnnotation((event as any).annotation);
        console.log('✅ Annotation created and committed, ready to save to backend');
      } else if (event.type === 'update' && (event as any).committed) {
        console.log('✅ Annotation updated and committed, ready to sync to backend');
      } else if (event.type === 'delete' && (event as any).committed) {
        console.log('✅ Annotation deleted and committed, ready to remove from backend');
      }
    });

    // Clean up the subscription when the component unmounts
    return unsubscribe;
  }, [annotationApi, onAnnotationEvent]);

  return null; // This is a non-visual component
};

