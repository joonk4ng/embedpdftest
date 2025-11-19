# Signing System Debugging Guide

Quick reference for debugging PDF signing/annotation display issues.

## Quick Start - Automatic Debugging

The debugging utility is now **automatically integrated** into all signing system components! 

### Enable/Disable Debugging

**To enable debugging**, open your browser console and run:
```javascript
window.ENABLE_SIGNING_DEBUG = true;
```

**To disable debugging**, run:
```javascript
window.ENABLE_SIGNING_DEBUG = false;
```

**Note**: Debugging is **enabled by default**. Set `window.ENABLE_SIGNING_DEBUG = false` to disable.

### What Gets Logged Automatically

When debugging is enabled, the following components automatically log trace information:

1. **PDFSigning.tsx** - Logs when page initializes, PDF checks, and storage verification
2. **EmbedPDFViewer.tsx** - Logs PDF loading state, engine status, and render conditions
3. **usePDFLoader.ts** - Logs PDF loading from storage, blob URL creation, and plugin setup
4. **PDFLoaderTrigger** - Logs EmbedPDF loader events and document loading

All logs are prefixed with `🔍 [SIGNING TRACE]` for easy filtering in the console.

### Manual Debugging Commands

You can also run these commands manually in the console:

#### 1. Check if PDF is available
```javascript
// This is already called automatically, but you can run it manually:
import { quickCheckPDF } from './src/utils/signingSystemDebug';
await quickCheckPDF('federal-form');
```

#### 2. Run full trace
```javascript
// This is already called automatically, but you can run it manually:
import { traceSigningSystem } from './src/utils/signingSystemDebug';
await traceSigningSystem('federal-form');
```

#### 3. Check all PDFs in storage
```javascript
// This is already called automatically, but you can run it manually:
import { checkAllPDFs } from './src/utils/signingSystemDebug';
await checkAllPDFs();
```

---

## Key Files in Signing System

### Entry Points
1. **`src/pages/PDFSigning.tsx`**
   - Main signing page component
   - Reads `pdfId` from URL
   - Verifies PDF exists before rendering viewer

2. **`src/components/PDF/EmbedPDFViewer.tsx`**
   - Main PDF viewer component
   - Uses EmbedPDF library
   - Manages PDF loading and display

### Core Logic
3. **`src/hooks/usePDFLoader.ts`**
   - Loads PDF from IndexedDB
   - Creates blob URL
   - Sets up EmbedPDF plugins

4. **`src/utils/pdfStorage.ts`**
   - IndexedDB storage utilities
   - `getPDF(id)` - Retrieve PDF
   - `storePDFWithId(id, blob, ...)` - Store PDF

### PDF Generation
5. **`src/hooks/usePDFGeneration.ts`**
   - Generates filled PDF
   - Stores PDF with ID `'federal-form'`
   - Navigates to signing page

---

## File Call Flow

```
1. usePDFGeneration.generatePDF()
   └─> storePDFWithId('federal-form', blob, ...)
       └─> IndexedDB: ctr-pdf-storage.pdfs.put()
   └─> navigate('/pdf-signing?pdfId=federal-form')

2. PDFSigning component
   └─> getPDF('federal-form')
       └─> IndexedDB: ctr-pdf-storage.pdfs.get()
   └─> <EmbedPDFViewer pdfId="federal-form" />

3. EmbedPDFViewer
   └─> usePDFLoader('federal-form')
       └─> getPDF('federal-form')
           └─> IndexedDB: ctr-pdf-storage.pdfs.get()
       └─> URL.createObjectURL(blob)
       └─> createPluginRegistration(LoaderPluginPackage, {url})
   └─> <PDFLoaderTrigger />
       └─> loaderProvides.loadDocument({url})
           └─> EmbedPDF LoaderPlugin
               └─> fetch(url) → Display PDF
```

---

## Common Issues & Solutions

### Issue: "PDF not found" error

**Symptoms:**
- Error message: "PDF not found. Please return to the main page and try again."
- PDFSigning page shows error state

**Debug Steps:**
1. Check if PDF exists in IndexedDB:
   ```javascript
   await checkAllPDFs();
   ```
2. Verify PDF ID matches:
   - URL should have `?pdfId=federal-form`
   - Check console for actual `pdfId` value
3. Check if PDF was stored correctly:
   - Look for `storePDFWithId()` calls in console
   - Verify no errors during PDF generation

**Solution:**
- Regenerate PDF from main page
- Check `usePDFGeneration` hook stores PDF correctly
- Verify IndexedDB is accessible (check browser permissions)

---

### Issue: PDF loads but doesn't display

**Symptoms:**
- No error messages
- Loading spinner shows but PDF never appears
- Console shows PDF loaded but viewport is empty

**Debug Steps:**
1. Check blob URL creation:
   ```javascript
   // In usePDFLoader.ts, check console logs
   // Look for: "✅ usePDFLoader: Blob URL is accessible"
   ```
2. Check EmbedPDF engine:
   ```javascript
   // In EmbedPDFViewer.tsx, check:
   // - engineLoading state
   // - engine object exists
   // - plugins array length > 0
   ```
3. Check EmbedPDF loader events:
   ```javascript
   // In PDFLoaderTrigger, check for:
   // - 'start' event
   // - 'complete' event
   // - 'error' event
   ```

**Solution:**
- Verify EmbedPDF engine is initialized
- Check plugin configuration
- Verify blob URL is accessible
- Check EmbedPDF version compatibility

---

### Issue: Blob URL not accessible

**Symptoms:**
- Error: "Blob URL is not accessible"
- Fetch test fails in `usePDFLoader`

**Debug Steps:**
1. Check blob validity:
   ```javascript
   const pdf = await getPDF('federal-form');
   console.log('Blob size:', pdf.pdf.size);
   console.log('Blob type:', pdf.pdf.type);
   ```
2. Check if blob was consumed:
   ```javascript
   // Blob can only be read once in some cases
   // Check if arrayBuffer() was called multiple times
   ```

**Solution:**
- Ensure blob is not consumed before URL creation
- Create defensive copy of ArrayBuffer
- Verify blob is not revoked too early

---

### Issue: EmbedPDF loader errors

**Symptoms:**
- Console shows EmbedPDF loader error events
- PDF fails to load into engine

**Debug Steps:**
1. Check loader configuration:
   ```javascript
   // In usePDFLoader.ts, verify:
   // - loadingOptions.type === 'url'
   // - loadingOptions.pdfFile.url is valid
   // - loadingOptions.pdfFile.id matches
   ```
2. Check loader events:
   ```javascript
   // In PDFLoaderTrigger, check event.type:
   // - 'error' → check event.error
   // - 'complete' → check event.documentId
   ```

**Solution:**
- Verify URL is accessible (test with fetch)
- Check EmbedPDF plugin registration
- Verify engine is ready before loading
- Check EmbedPDF version compatibility

---

## Debugging Checklist

When PDF fails to display:

- [ ] **PDF exists in IndexedDB?**
  ```javascript
  await checkAllPDFs();
  ```

- [ ] **PDF ID matches?**
  - Check URL parameter: `?pdfId=federal-form`
  - Check console for actual `pdfId` value

- [ ] **PDF blob is valid?**
  - Size > 0
  - Header starts with `%PDF`
  - Type is `application/pdf`

- [ ] **Blob URL created?**
  - Check console: "✅ usePDFLoader: Blob URL is accessible"
  - Test URL with `fetch()`

- [ ] **EmbedPDF engine initialized?**
  - Check `engineLoading` state
  - Verify `engine` object exists

- [ ] **Plugins registered?**
  - Check `plugins.length > 0`
  - Verify LoaderPluginPackage is included

- [ ] **Loader triggered?**
  - Check `PDFLoaderTrigger` component mounted
  - Look for loader events in console

- [ ] **No errors in console?**
  - Check for red error messages
  - Look for EmbedPDF error events

---

## Console Log Patterns

### Successful Load (with Debugging Enabled)
```
🔍 [SIGNING TRACE] PDFSIGNING_INIT
🔍 [SIGNING TRACE] PDFSIGNING_CHECK_PDF_START
🔍 [SIGNING TRACE] STAGE_1_CHECK_STORAGE
🔍 [SIGNING TRACE] STAGE_1_STORAGE_SUCCESS
🔍 [SIGNING TRACE] USEPDFLOADER_START
🔍 [SIGNING TRACE] USEPDFLOADER_STORAGE_FOUND
🔍 [SIGNING TRACE] USEPDFLOADER_BLOB_VALID
🔍 [SIGNING TRACE] USEPDFLOADER_BLOB_URL_CREATED
🔍 [SIGNING TRACE] USEPDFLOADER_BLOB_URL_ACCESSIBLE
🔍 [SIGNING TRACE] USEPDFLOADER_PLUGINS_CREATED
🔍 [SIGNING TRACE] USEPDFLOADER_COMPLETE
🔍 [SIGNING TRACE] PDFLOADERTRIGGER_INIT
🔍 [SIGNING TRACE] PDFLOADERTRIGGER_START
🔍 [SIGNING TRACE] PDFLOADERTRIGGER_DOC_LOADED
🔍 [SIGNING TRACE] PDFLOADERTRIGGER_DOC_READY
🔍 [SIGNING TRACE] EMBEDPDFVIEWER_READY
✅ usePDFLoader: PDF found in IndexedDB
✅ usePDFLoader: PDF blob header verified: %PDF
✅ usePDFLoader: Blob URL is accessible
✅ usePDFLoader: Plugins created and set
✅ PDFLoaderTrigger: PDF loading completed
✅ EmbedPDFViewer: All conditions met for PDF rendering
```

### Failed Load (with Debugging Enabled)
```
🔍 [SIGNING TRACE] PDFSIGNING_INIT
🔍 [SIGNING TRACE] PDFSIGNING_CHECK_PDF_START
🔍 [SIGNING TRACE] STAGE_1_STORAGE_ERROR
🔍 [SIGNING TRACE] PDFSIGNING_CHECK_PDF_FAILED
❌ usePDFLoader: PDF not found in storage
❌ usePDFLoader: PDF blob does not start with %PDF header
❌ usePDFLoader: Blob URL is not accessible
❌ PDFLoaderTrigger: PDF loading error: ...
❌ EmbedPDFViewer: No EmbedPDF elements found in DOM
```

### Filtering Debug Logs

To see only debug traces in the console, use the browser's console filter:
- Chrome/Edge: Type `[SIGNING TRACE]` in the filter box
- Firefox: Type `SIGNING TRACE` in the filter box

---

## Manual IndexedDB Check

Open browser DevTools → Application → IndexedDB → `ctr-pdf-storage` → `pdfs`:

1. Check if `federal-form` entry exists
2. Verify `pdf` blob has size > 0
3. Check `metadata` object has correct values
4. Verify `timestamp` is recent

---

## Next Steps

1. Run `traceSigningSystem('federal-form')` to get full trace
2. Check console logs for specific error messages
3. Verify each stage in the call chain
4. Use debugging checklist above
5. Check `SIGNING_SYSTEM_FILE_TRACE.md` for detailed flow

