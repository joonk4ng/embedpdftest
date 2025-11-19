# Signing System File Call Trace

This document traces the complete file call chain for the PDF signing/annotation system to help identify where file loading failures occur.

## Overview Flow

```
User Action → PDF Generation → Storage → Navigation → PDFSigning Page → EmbedPDFViewer → usePDFLoader → pdfStorage → EmbedPDF Loader → Display
```

---

## Stage 1: PDF Generation & Storage

### File: `src/hooks/usePDFGeneration.ts`

**Function**: `generatePDF()`

**Process**:
1. Loads base PDF template from IndexedDB:
   ```typescript
   const storedPDF = await getPDF('federal-form');
   ```
   - **Calls**: `src/utils/pdfStorage.ts` → `getPDF('federal-form')`
   - **Returns**: `PDFData | undefined` from IndexedDB

2. Fills PDF with form data using `pdf-lib`

3. Stores filled PDF back to IndexedDB:
   ```typescript
   await storePDFWithId('federal-form', filledPdfBlob, null, metadata);
   ```
   - **Calls**: `src/utils/pdfStorage.ts` → `storePDFWithId()`
   - **Storage**: IndexedDB database `'ctr-pdf-storage'`, table `'pdfs'`, key `'federal-form'`

4. Navigates to signing page:
   ```typescript
   navigate(`/pdf-signing?pdfId=federal-form&crewNumber=...&fireName=...&fireNumber=...&date=...`);
   ```

**Key Points**:
- PDF ID is **always** `'federal-form'` for federal forms
- PDF is stored as a **Blob** in IndexedDB
- Navigation includes `pdfId` as URL parameter

---

## Stage 2: PDFSigning Page Initialization

### File: `src/pages/PDFSigning.tsx`

**Component**: `PDFSigning`

**Process**:
1. **Reads URL parameters** (line 27-32):
   ```typescript
   const urlPdfId = searchParams.get('pdfId') || 'federal-form';
   ```
   - Defaults to `'federal-form'` if not in URL

2. **Verifies PDF exists** (line 42-53):
   ```typescript
   const storedPDF = await getPDF(urlPdfId);
   if (!storedPDF) {
     setError('PDF not found. Please return to the main page and try again.');
   }
   ```
   - **Calls**: `src/utils/pdfStorage.ts` → `getPDF(urlPdfId)`
   - **Checks**: If PDF exists in IndexedDB
   - **Error**: Sets error state if PDF not found

3. **Renders EmbedPDFViewer** (line 222-227):
   ```typescript
   <EmbedPDFViewer
     pdfId={pdfId}
     onSave={handleSave}
     crewInfo={crewInfo}
     date={date}
   />
   ```

**Key Points**:
- PDF ID comes from URL parameter or defaults to `'federal-form'`
- First check happens here - if PDF doesn't exist, error is shown
- Passes `pdfId` prop to `EmbedPDFViewer`

---

## Stage 3: EmbedPDFViewer Component

### File: `src/components/PDF/EmbedPDFViewer.tsx`

**Component**: `EmbedPDFViewer`

**Process**:
1. **Calls usePDFLoader hook** (line 81):
   ```typescript
   const { pdfUrl, plugins, isLoading, error, pdfDocRef } = usePDFLoader(pdfId, pdfBlob, date);
   ```
   - **Calls**: `src/hooks/usePDFLoader.ts` → `usePDFLoader(pdfId, pdfBlob, date)`
   - **Returns**: `{ pdfUrl, plugins, isLoading, error, pdfDocRef }`

2. **Renders PDFLoaderTrigger component** (line 554):
   ```typescript
   <PDFLoaderTrigger pdfUrl={pdfUrl} pdfId={pdfId} onError={setComponentError} />
   ```
   - **Component**: Defined in same file (line 712-803)
   - **Purpose**: Triggers actual PDF loading in EmbedPDF

3. **Renders EmbedPDF with plugins** (line 548-621):
   ```typescript
   <EmbedPDF engine={engine} plugins={plugins}>
     <PDFLoaderTrigger ... />
     <Viewport>...</Viewport>
   </EmbedPDF>
   ```

**Key Points**:
- Receives `pdfId` prop from `PDFSigning` page
- Delegates actual loading to `usePDFLoader` hook
- `PDFLoaderTrigger` uses EmbedPDF's loader capability to trigger loading

---

## Stage 4: usePDFLoader Hook

### File: `src/hooks/usePDFLoader.ts`

**Hook**: `usePDFLoader(pdfId?, pdfBlob?, date?)`

**Process** (inside `useEffect`, line 42-475):

1. **Validates input** (line 43-48):
   ```typescript
   if (!pdfId && !pdfBlob) {
     setError('Either pdfId or pdfBlob must be provided');
     return;
   }
   ```

2. **Loads PDF from IndexedDB** (line 69-74):
   ```typescript
   if (pdfId) {
     const storedPDF = await getPDF(pdfId);
     if (!storedPDF) {
       throw new Error('PDF not found in storage');
     }
     pdfBlobToUse = storedPDF.pdf;
   }
   ```
   - **Calls**: `src/utils/pdfStorage.ts` → `getPDF(pdfId)`
   - **Returns**: `PDFData` object with `pdf: Blob` property
   - **Error**: Throws if PDF not found

3. **Validates PDF blob** (line 124-142):
   - Checks blob size > 0
   - Reads ArrayBuffer
   - Verifies PDF header (`%PDF`)

4. **Creates blob URL** (line 342-366):
   ```typescript
   const url = URL.createObjectURL(finalPdfBlob);
   ```
   - Creates object URL from PDF blob
   - Tests URL accessibility with `fetch()`
   - Sets `pdfUrl` state

5. **Creates EmbedPDF plugins** (line 401-425):
   ```typescript
   const pdfPlugins = [
     createPluginRegistration(LoaderPluginPackage, {
       loadingOptions: {
         type: 'url',
         pdfFile: {
           id: effectivePdfId,
           url: url,  // The blob URL
         },
       },
     }),
     // ... other plugins
   ];
   ```

**Key Points**:
- **Second check** happens here - loads PDF from IndexedDB
- Creates **blob URL** from PDF blob
- Sets up EmbedPDF **LoaderPlugin** with the blob URL
- Returns `pdfUrl` and `plugins` array

---

## Stage 5: PDF Storage Utility

### File: `src/utils/pdfStorage.ts`

**Functions**:

1. **`getPDF(id: string)`** (line 53-55):
   ```typescript
   export async function getPDF(id: string): Promise<PDFData | undefined> {
     return await pdfStorageDB.pdfs.get(id);
   }
   ```
   - **Database**: IndexedDB (`'ctr-pdf-storage'`)
   - **Table**: `'pdfs'`
   - **Key**: `id` parameter
   - **Returns**: `PDFData | undefined`

2. **`storePDFWithId(...)`** (line 31-51):
   ```typescript
   export async function storePDFWithId(
     id: string,
     pdf: Blob,
     preview: Blob | null,
     metadata: {...}
   ): Promise<void> {
     await pdfStorageDB.pdfs.put(pdfData);
   }
   ```

**Key Points**:
- Uses **Dexie** library for IndexedDB access
- Database name: `'ctr-pdf-storage'`
- Table name: `'pdfs'`
- Primary key: `id` (string)

---

## Stage 6: PDFLoaderTrigger Component

### File: `src/components/PDF/EmbedPDFViewer.tsx` (line 712-803)

**Component**: `PDFLoaderTrigger`

**Process**:

1. **Gets loader capability** (line 717):
   ```typescript
   const { provides: loaderProvides } = useLoaderCapability();
   ```
   - **Hook**: `@embedpdf/plugin-loader/react` → `useLoaderCapability()`
   - **Returns**: `loaderProvides` object with loader methods

2. **Checks if document already loaded** (line 727-736):
   ```typescript
   const existingDoc = loaderProvides.getDocument();
   if (existingDoc) {
     // Document already loaded
     return;
   }
   ```

3. **Listens for loader events** (line 739-750):
   ```typescript
   loaderProvides.onLoaderEvent((event) => {
     if (event.type === 'error') {
       onError(event.error?.message || 'Failed to load PDF');
     }
   });
   ```

4. **Manually triggers loading** (line 766-782):
   ```typescript
   await loaderProvides.loadDocument({
     type: 'url',
     pdfFile: {
       id: effectivePdfId,
       url: pdfUrl,
     },
   });
   ```
   - **Calls**: EmbedPDF LoaderPlugin's `loadDocument()` method
   - **Parameters**: Same URL that was passed to plugin configuration

**Key Points**:
- Uses EmbedPDF's **loader capability** hook
- May auto-load from plugin config, or manually triggers loading
- Listens for errors and reports them via `onError` callback

---

## Stage 7: EmbedPDF Loader Plugin

### Library: `@embedpdf/plugin-loader`

**Process** (internal to EmbedPDF library):

1. Receives loading configuration from plugin registration:
   ```typescript
   {
     type: 'url',
     pdfFile: {
       id: 'federal-form',
       url: 'blob:http://localhost:5173/...'
     }
   }
   ```

2. Fetches PDF from the URL:
   ```typescript
   const response = await fetch(url);
   const pdfBytes = await response.arrayBuffer();
   ```

3. Loads PDF into EmbedPDF engine

4. Emits events:
   - `'start'` - Loading started
   - `'complete'` - Loading completed
   - `'error'` - Loading failed

---

## Complete Call Chain Summary

```
1. usePDFGeneration.generatePDF()
   └─> pdfStorage.getPDF('federal-form')
       └─> IndexedDB: ctr-pdf-storage.pdfs.get('federal-form')
   └─> pdfStorage.storePDFWithId('federal-form', blob, ...)
       └─> IndexedDB: ctr-pdf-storage.pdfs.put({id: 'federal-form', pdf: blob, ...})
   └─> navigate('/pdf-signing?pdfId=federal-form&...')

2. PDFSigning component (mounts)
   └─> pdfStorage.getPDF('federal-form')
       └─> IndexedDB: ctr-pdf-storage.pdfs.get('federal-form')
   └─> <EmbedPDFViewer pdfId="federal-form" />

3. EmbedPDFViewer component
   └─> usePDFLoader('federal-form', undefined, date)
       └─> pdfStorage.getPDF('federal-form')
           └─> IndexedDB: ctr-pdf-storage.pdfs.get('federal-form')
       └─> URL.createObjectURL(pdfBlob)
       └─> fetch(url) [validates blob URL]
       └─> createPluginRegistration(LoaderPluginPackage, {loadingOptions: {url}})
   └─> <PDFLoaderTrigger pdfUrl={url} pdfId="federal-form" />
       └─> useLoaderCapability()
       └─> loaderProvides.loadDocument({type: 'url', pdfFile: {id, url}})
           └─> EmbedPDF LoaderPlugin
               └─> fetch(url)
               └─> Load PDF into engine
```

---

## Potential Failure Points

### 1. **PDF Not Stored** (Stage 1)
- **Location**: `usePDFGeneration.ts` → `storePDFWithId()`
- **Symptom**: PDF not found error in PDFSigning page
- **Check**: Verify PDF is actually stored in IndexedDB

### 2. **PDF ID Mismatch** (Stage 2)
- **Location**: `PDFSigning.tsx` → URL parameter parsing
- **Symptom**: Wrong PDF loaded or PDF not found
- **Check**: Verify `pdfId` in URL matches stored PDF ID

### 3. **IndexedDB Access Failure** (Stage 5)
- **Location**: `pdfStorage.ts` → `getPDF()`
- **Symptom**: PDF not found even though it was stored
- **Check**: IndexedDB database/table access, browser permissions

### 4. **Blob URL Creation Failure** (Stage 4)
- **Location**: `usePDFLoader.ts` → `URL.createObjectURL()`
- **Symptom**: Blob URL not accessible
- **Check**: Blob validity, URL creation, fetch test

### 5. **EmbedPDF Loader Failure** (Stage 6-7)
- **Location**: `PDFLoaderTrigger` → `loaderProvides.loadDocument()`
- **Symptom**: PDF doesn't display, loader error events
- **Check**: EmbedPDF plugin configuration, URL accessibility, engine initialization

### 6. **Blob Consumption** (Stage 4)
- **Location**: `usePDFLoader.ts` → ArrayBuffer reading
- **Symptom**: PDF loads but is corrupted or empty
- **Check**: Blob/ArrayBuffer handling, defensive copying

---

## Debugging Checklist

When PDF fails to display for signing/annotation:

1. ✅ **Check PDF exists in IndexedDB**:
   ```javascript
   // In browser console
   const db = await indexedDB.open('ctr-pdf-storage');
   const tx = db.transaction('pdfs', 'readonly');
   const store = tx.objectStore('pdfs');
   const pdf = await store.get('federal-form');
   console.log('PDF in IndexedDB:', pdf);
   ```

2. ✅ **Check PDF ID in URL**:
   - Navigate to signing page
   - Check URL parameters: `?pdfId=federal-form&...`
   - Verify `pdfId` matches stored PDF ID

3. ✅ **Check blob URL creation**:
   - In `usePDFLoader.ts`, verify blob URL is created
   - Test URL with `fetch()` - should return PDF blob
   - Check console for blob URL accessibility errors

4. ✅ **Check EmbedPDF loader events**:
   - In `PDFLoaderTrigger`, check for loader events
   - Look for `'error'` events in console
   - Verify `loadDocument()` is called

5. ✅ **Check EmbedPDF engine**:
   - Verify engine is initialized (`usePdfiumEngine()`)
   - Check engine loading state
   - Verify plugins are created correctly

6. ✅ **Check PDF blob validity**:
   - Verify blob size > 0
   - Check PDF header (`%PDF`)
   - Verify blob type is `'application/pdf'`

---

## Common Issues & Solutions

### Issue: "PDF not found" error
- **Cause**: PDF not stored or wrong ID
- **Solution**: Check `usePDFGeneration` stores PDF correctly, verify ID matches

### Issue: PDF loads but doesn't display
- **Cause**: EmbedPDF loader/engine issue
- **Solution**: Check EmbedPDF plugin configuration, engine initialization, loader events

### Issue: Blob URL not accessible
- **Cause**: Blob consumed or URL revoked too early
- **Solution**: Ensure blob is not consumed, URL not revoked before use

### Issue: PDF displays but annotations don't work
- **Cause**: Annotation plugin not configured or engine issue
- **Solution**: Check AnnotationPluginPackage is registered, annotation controls available

