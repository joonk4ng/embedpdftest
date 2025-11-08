# PDF Viewer Root Cause Analysis

## Issue Summary
The PDF viewer briefly appears then gets covered/hidden. Container refs become `null` during cleanup, suggesting component unmounting.

## Identified Root Causes

### 1. **React Router + App Wrapper Structure**
- **Issue**: PDFSigning is nested inside `.app` div with `padding: 1rem`
- **Impact**: The padding creates a layout context that might interfere with fixed positioning
- **Evidence**: CSS selector `.app > div[style*="position: fixed"]` may not match correctly
- **Fix**: Move PDFSigning outside `.app` wrapper or use React Portal

### 2. **useEffect Dependency on Ref**
- **Issue**: `useEffect(() => {...}, [containerRef.current])` in PDFSigning
- **Impact**: Refs don't trigger re-renders, so this dependency is ineffective and might cause issues
- **Evidence**: Logs show ref becoming null during cleanup
- **Fix**: Remove ref from dependency array, use callback refs instead

### 3. **Component Unmounting/Remounting**
- **Issue**: React is unmounting the component (refs become null)
- **Possible Causes**:
  - React Router causing route remounts
  - Parent component re-rendering
  - State updates causing conditional rendering
  - StrictMode (disabled but pattern suggests similar behavior)

### 4. **Legacy CSS Conflicts**
- **Issue**: Multiple CSS files targeting `.enhanced-pdf-viewer` classes
- **Files**: 
  - `ResponsivePDFViewer.css` - targets `.enhanced-pdf-viewer-wrapper`
  - `PDFViewer.css` - targets `.enhanced-pdf-viewer`
  - `EmbedPDFViewer.css` - targets `.embedpdf-viewer-wrapper`
- **Impact**: Legacy styles might be hiding/covering the new viewer
- **Fix**: Ensure new viewer uses unique class names or override legacy styles

### 5. **CSS Selector Matching Issue**
- **Issue**: `.app > div[style*="position: fixed"]` selector might not match
- **Impact**: The CSS override for fixed positioning might not apply
- **Evidence**: PDFSigning has inline styles, not a style attribute string
- **Fix**: Use a class name or data attribute instead

### 6. **Z-Index Stacking Context**
- **Issue**: Multiple elements with z-index creating stacking contexts
- **Evidence**: 
  - PDFSigning: z-index 10000
  - FederalTimeTable modal: z-index 2000
  - Various components with z-index values
- **Impact**: Stacking context issues might hide the viewer
- **Fix**: Ensure proper z-index hierarchy

### 7. **Container Ref Cleanup**
- **Issue**: Refs are being cleared during React's cleanup phase
- **Evidence**: "Container ref callback with null (cleanup)" logs
- **Impact**: Iframe gets removed when component unmounts
- **Fix**: Prevent unnecessary unmounts or preserve iframe across remounts

## Recommended Fixes (Priority Order)

1. **Move PDFSigning outside `.app` wrapper** - Use React Portal or restructure routes
2. **Fix useEffect dependencies** - Remove ref from dependency arrays
3. **Add unique class name** - Use `.embedpdf-signing-page` instead of inline style matching
4. **Prevent unmounting** - Use React.memo or check what's causing remounts
5. **Override legacy CSS** - Add more specific selectors or remove legacy imports

