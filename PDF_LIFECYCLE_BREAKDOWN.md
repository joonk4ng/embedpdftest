# PDF Document Lifecycle - Complete File Breakdown

This document provides a comprehensive breakdown of all files involved in the PDF lifecycle from form filling to final save.

---

## 📋 Table of Contents

1. [Stage 1: Form Data Collection & Validation](#stage-1-form-data-collection--validation)
2. [Stage 2: PDF Field Mapping](#stage-2-pdf-field-mapping)
3. [Stage 3: PDF Filling](#stage-3-pdf-filling)
4. [Stage 4: PDF Storage](#stage-4-pdf-storage)
5. [Stage 5: PDF Display](#stage-5-pdf-display)
6. [Stage 6: PDF Annotation](#stage-6-pdf-annotation)
7. [Stage 7: PDF Saving](#stage-7-pdf-saving)
8. [Supporting Files](#supporting-files)

---

## Stage 1: Form Data Collection & Validation

**Purpose**: User fills out form, data is collected and validated before PDF generation.

### Primary Files

#### `src/components/FederalTimeTable.tsx`
- **Role**: Main form component where users enter data
- **Key Functions**:
  - `handleViewPDF()` (line 894) - Entry point for PDF generation
  - Form state management (`federalFormData`, `equipmentEntries`, `personnelEntries`)
  - Form validation before PDF creation
- **What to look for**:
  - Form data state variables
  - Validation logic
  - Navigation to PDF signing page

#### `src/utils/timevalidation.ts`
- **Role**: Validates form data before PDF generation
- **Key Functions**:
  - `validateFederalFormData()` - Validates federal form data
- **What to look for**:
  - Validation rules
  - Error messages

#### `src/utils/engineTimeDB.ts`
- **Role**: Database operations for form data
- **Key Functions**:
  - `loadFederalFormData()` - Loads form data from IndexedDB
  - `loadAllFederalEquipmentEntries()` - Loads equipment entries
  - `loadAllFederalPersonnelEntries()` - Loads personnel entries
  - `savePDFMetadata()` - Saves PDF metadata after generation
- **What to look for**:
  - Database schema
  - Data retrieval functions
  - Metadata storage

---

## Stage 2: PDF Field Mapping

**Purpose**: Maps form data structure to PDF field names.

### Primary Files

#### `src/utils/fieldmapper/federalFieldMapper.ts`
- **Role**: Maps form data to PDF field names
- **Key Functions**:
  - `mapFederalToPDFFields()` (line 71) - Main mapping function
  - `getFederalPDFFieldName()` - Converts logical names to PDF field names
  - `autoCalculateFederalEquipmentTotals()` - Calculates equipment totals
  - `autoCalculateFederalPersonnelTotals()` - Calculates personnel totals
- **What to look for**:
  - Field name mappings (e.g., `agreementNumber` → PDF field name)
  - Data transformations
  - Time entry calculations

#### `src/utils/fieldmapper/eestFieldMapper.ts`
- **Role**: Similar to federal mapper but for EEST forms
- **Note**: Not used for OF297-24.pdf (federal form)

---

## Stage 3: PDF Filling

**Purpose**: Takes mapped field data and fills the PDF template.

### Primary Files

#### `src/components/FederalTimeTable.tsx` (continued)
- **Key Section**: `handleViewPDF()` function (lines 894-1067)
- **Process**:
  1. Validates form data
  2. Maps form data to PDF fields using `mapFederalToPDFFields()`
  3. Loads base PDF template from IndexedDB using `getPDF('federal-form')`
  4. Uses **pdf-lib** to load PDF: `PDFLib.PDFDocument.load()`
  5. Gets form object: `pdfDoc.getForm()`
  6. Fills each field: `form.getField(fieldName).setText(value)` or `.check()`, `.select()`
  7. Saves filled PDF: `pdfDoc.save()` → converts to Blob
  8. Stores filled PDF back to IndexedDB: `storePDFWithId('federal-form', filledPdfBlob, ...)`
  9. Navigates to signing page: `navigate('/pdf-signing?pdfId=federal-form&...')`

#### `src/utils/pdfStorage.ts`
- **Role**: IndexedDB storage for PDFs
- **Key Functions**:
  - `getPDF(id)` - Retrieves PDF from IndexedDB
  - `storePDFWithId(id, pdf, preview, metadata)` - Stores PDF in IndexedDB
  - `listPDFs()` - Lists all stored PDFs
- **What to look for**:
  - Database structure (`PDFData` interface)
  - Storage/retrieval operations

---

## Stage 4: PDF Storage

**Purpose**: Stores and retrieves PDFs from IndexedDB.

### Primary Files

#### `src/utils/pdfStorage.ts`
- **Database**: IndexedDB (`ctr-pdf-storage` database, `pdfs` store)
- **Data Structure**:
  ```typescript
  interface PDFData {
    id: string;              // e.g., 'federal-form'
    pdf: Blob;               // The actual PDF file
    preview: Blob | null;    // Optional PNG preview
    metadata: {
      filename: string;
      date: string;
      crewNumber: string;
      fireName: string;
      fireNumber: string;
    };
    timestamp: string;
  }
  ```

---

## Stage 5: PDF Display

**Purpose**: Loads PDF from storage and displays it using EmbedPDF.

### Primary Files

#### `src/pages/PDFSigning.tsx`
- **Role**: Page component that wraps the PDF viewer
- **Key Functions**:
  - Reads `pdfId` from URL parameters
  - Passes `pdfId` to `EmbedPDFViewer` component
  - Handles save callback: `handleSave()`
- **What to look for**:
  - URL parameter parsing
  - Component mounting
  - Save handler

#### `src/components/PDF/EmbedPDFViewer.tsx`
- **Role**: Main PDF viewer component using EmbedPDF library
- **Key Sections**:
  1. **PDF Loading** (lines 100-429):
     - `useEffect` hook that loads PDF when `pdfId` or `pdfBlob` changes
     - Can load from IndexedDB (`pdfId`) OR accept blob directly (`pdfBlob`)
     - Creates blob URL: `URL.createObjectURL(pdfBlob)`
     - Sets up EmbedPDF plugins (Loader, Viewport, Render, Annotation, etc.)
  
  2. **EmbedPDF Setup** (lines 340-400):
     - `LoaderPluginPackage` - Loads PDF from URL
     - `ViewportPluginPackage` - Viewport management
     - `RenderPluginPackage` - PDF rendering
     - `AnnotationPluginPackage` - Annotation support
     - `ExportPluginPackage` - PDF export
  
  3. **Rendering** (lines 682-783):
     - `<EmbedPDF>` wrapper component
     - `<Viewport>` - Container for PDF
     - `<Scroller>` - Handles scrolling
     - `<RenderLayer>` - Renders PDF pages
     - `<AnnotationLayer>` - Renders annotations

- **What to look for**:
  - PDF loading logic (lines 112-429)
  - Plugin configuration
  - Render conditions (engine, pdfUrl, plugins)
  - Error handling

#### `src/styles/components/EmbedPDFViewer.css`
- **Role**: Styling for PDF viewer
- **What to look for**:
  - Container dimensions
  - Viewport styling
  - Annotation layer transparency

---

## Stage 6: PDF Annotation

**Purpose**: Allows user to draw/sign on the PDF using EmbedPDF annotations.

### Primary Files

#### `src/components/PDF/EmbedPDFViewer.tsx` (continued)
- **Key Sections**:
  1. **Annotation Controls** (lines 995-1269):
     - `EmbedPDFAnnotationControls` component
     - `toggleInk()` - Enables/disables drawing mode
     - `clearAnnotations()` - Clears all annotations
     - `exportPDF()` - Exports PDF with annotations
  
  2. **Annotation State** (lines 1004-1018):
     - Uses `useAnnotation()` hook from EmbedPDF
     - Tracks ink mode state
     - Monitors annotation changes

  3. **Annotation Layer** (lines 732-754):
     - `<AnnotationLayer>` component renders annotations
     - Only visible when `isDrawingMode` is true
     - Positioned absolutely over PDF pages

- **What to look for**:
  - `EmbedPDFAnnotationControls` component (lines 995-1269)
  - Annotation state management
  - Ink mode toggling
  - Export function (lines 1021-1235)

#### `src/components/PDF/DrawingCanvas.tsx`
- **Role**: Legacy drawing canvas (may not be used with EmbedPDF)
- **Note**: EmbedPDF uses its own annotation system, but this file exists for backward compatibility

---

## Stage 7: PDF Saving

**Purpose**: Saves annotated PDF with all changes.

### Primary Files

#### `src/components/PDF/EmbedPDFViewer.tsx` (continued)
- **Key Section**: `handleSave()` function (lines 455-530)
- **Process**:
  1. Calls `annotationControlsRef.current.exportPDF()` to get PDF with annotations
  2. Uses EmbedPDF's `saveAsCopy()` method (via Export plugin or engine fallback)
  3. Gets annotated PDF as Blob
  4. Creates preview image using PDF.js
  5. Calls `onSave(finalPdfBlob, previewBlob)` callback

- **Export Methods** (in `EmbedPDFAnnotationControls.exportPDF()`):
  1. **Primary**: `exportProvides.saveAsCopy()` - Uses Export plugin
  2. **Fallback**: `engine.saveAsCopy(document).toPromise()` - Direct engine access

#### `src/pages/PDFSigning.tsx` (continued)
- **Key Section**: `handleSave()` function (lines 58-91)
- **Process**:
  1. Receives PDF blob and preview from `EmbedPDFViewer`
  2. Generates filename based on crew info and date
  3. Stores signed PDF to IndexedDB: `storePDFWithId(signedPdfId, pdfData, previewImage, metadata)`
  4. Triggers browser download
  5. Navigates back to main page

#### `src/utils/PDF/pdfSaveHandler.ts`
- **Role**: Legacy save handler (may not be used with EmbedPDF)
- **Note**: This file contains old save logic using PDF.js and canvas flattening. EmbedPDF handles saving differently.

#### `src/utils/PDF/pdfFlattening.ts`
- **Role**: Legacy flattening utilities (may not be used with EmbedPDF)
- **Functions**:
  - `flattenPDFToImage()` - Renders PDF to canvas
  - `createFlattenedPDF()` - Creates PDF from image
- **Note**: EmbedPDF handles annotations natively, so flattening may not be needed

---

## Supporting Files

### Data Management

#### `src/utils/entryPropagation.ts`
- **Role**: Handles time entry calculations and propagation
- **What to look for**:
  - Time calculations
  - Entry relationships

#### `src/utils/timeCalculations.ts`
- **Role**: Time calculation utilities
- **What to look for**:
  - Time math functions
  - Duration calculations

#### `src/utils/types.ts`
- **Role**: TypeScript type definitions
- **What to look for**:
  - Interface definitions
  - Type exports

### Utilities

#### `src/utils/filenameGenerator.ts`
- **Role**: Generates PDF filenames
- **Key Functions**:
  - `generateExportFilename()` - Creates standardized filenames

#### `src/utils/PDF/pdfConstants.ts`
- **Role**: PDF-related constants
- **What to look for**:
  - Field name constants
  - PDF configuration

#### `src/utils/PDF/pdfRendering.ts`
- **Role**: PDF.js rendering utilities (legacy)
- **Note**: May not be used with EmbedPDF

---

## 🔄 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ STAGE 1: Form Data Collection                               │
│ File: src/components/FederalTimeTable.tsx                   │
│ - User fills form                                           │
│ - Data stored in component state                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 2: Validation                                         │
│ File: src/utils/timevalidation.ts                           │
│ - Validates form data                                       │
│ - Returns validation errors if any                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 3: Field Mapping                                      │
│ File: src/utils/fieldmapper/federalFieldMapper.ts          │
│ - Maps form data to PDF field names                         │
│ - Calculates totals                                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 4: PDF Filling                                        │
│ File: src/components/FederalTimeTable.tsx (handleViewPDF)  │
│ - Loads base PDF from IndexedDB                             │
│ - Uses pdf-lib to fill fields                               │
│ - Saves filled PDF back to IndexedDB                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 5: PDF Storage                                        │
│ File: src/utils/pdfStorage.ts                               │
│ - Stores filled PDF in IndexedDB                            │
│ - ID: 'federal-form'                                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 6: Navigation                                         │
│ File: src/components/FederalTimeTable.tsx                   │
│ - Navigates to /pdf-signing?pdfId=federal-form              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 7: PDF Display                                        │
│ File: src/pages/PDFSigning.tsx                              │
│ - Reads pdfId from URL                                      │
│ - Renders EmbedPDFViewer component                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 8: PDF Loading                                        │
│ File: src/components/PDF/EmbedPDFViewer.tsx                 │
│ - Loads PDF from IndexedDB (or accepts blob)                │
│ - Creates blob URL                                          │
│ - Sets up EmbedPDF plugins                                  │
│ - Renders PDF using EmbedPDF                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 9: PDF Annotation                                     │
│ File: src/components/PDF/EmbedPDFViewer.tsx                 │
│ - User clicks "Sign" button                                 │
│ - Annotation mode enabled                                   │
│ - User draws on PDF                                         │
│ - Annotations stored in EmbedPDF state                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 10: PDF Saving                                        │
│ File: src/components/PDF/EmbedPDFViewer.tsx (handleSave)   │
│ - Calls exportPDF() to get PDF with annotations             │
│ - Uses EmbedPDF's saveAsCopy() method                       │
│ - Returns annotated PDF blob                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 11: Final Save                                        │
│ File: src/pages/PDFSigning.tsx (handleSave)                 │
│ - Stores signed PDF to IndexedDB                            │
│ - Triggers browser download                                 │
│ - Saves metadata to database                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔑 Key Functions to Understand

### PDF Filling Flow
1. `FederalTimeTable.handleViewPDF()` - Entry point
2. `mapFederalToPDFFields()` - Maps data to PDF fields
3. `PDFLib.PDFDocument.load()` - Loads PDF template
4. `form.getField().setText()` - Fills PDF fields
5. `pdfDoc.save()` - Saves filled PDF
6. `storePDFWithId()` - Stores in IndexedDB

### PDF Display Flow
1. `PDFSigning` component mounts
2. `EmbedPDFViewer` receives `pdfId` prop
3. `getPDF(pdfId)` - Retrieves from IndexedDB
4. `URL.createObjectURL()` - Creates blob URL
5. EmbedPDF plugins load PDF from URL
6. PDF renders in viewport

### PDF Annotation Flow
1. User clicks "Sign" button
2. `toggleDrawingMode()` called
3. `annotationControlsRef.current.toggleInk()` - Enables ink mode
4. User draws on PDF
5. Annotations stored in EmbedPDF state

### PDF Saving Flow
1. User clicks "Save" button
2. `handleSave()` called
3. `annotationControlsRef.current.exportPDF()` - Gets PDF with annotations
4. `exportProvides.saveAsCopy()` OR `engine.saveAsCopy()` - Exports PDF
5. Returns Blob
6. `onSave()` callback in `PDFSigning` stores and downloads

---

## 📚 Library Usage

### pdf-lib
- **Used in**: PDF filling (Stage 3)
- **Files**: `FederalTimeTable.tsx`
- **Purpose**: Fill PDF form fields

### EmbedPDF (@embedpdf/*)
- **Used in**: PDF display and annotation (Stages 8-10)
- **Files**: `EmbedPDFViewer.tsx`
- **Purpose**: Display PDF, handle annotations, export PDF

### PDF.js (pdfjs-dist)
- **Used in**: Legacy rendering (may not be used with EmbedPDF)
- **Files**: `pdfRendering.ts`, `pdfFlattening.ts`
- **Purpose**: PDF rendering and flattening (legacy)

---

## 🎯 Quick Reference: Where to Look

| Task | Primary File | Key Function/Line |
|------|-------------|-------------------|
| Form data entry | `FederalTimeTable.tsx` | Component state |
| Form validation | `timevalidation.ts` | `validateFederalFormData()` |
| Field mapping | `fieldmapper/federalFieldMapper.ts` | `mapFederalToPDFFields()` |
| PDF filling | `FederalTimeTable.tsx` | `handleViewPDF()` (line 894) |
| PDF storage | `pdfStorage.ts` | `storePDFWithId()`, `getPDF()` |
| PDF display | `EmbedPDFViewer.tsx` | `useEffect` (line 100) |
| PDF annotation | `EmbedPDFViewer.tsx` | `EmbedPDFAnnotationControls` (line 995) |
| PDF saving | `EmbedPDFViewer.tsx` | `handleSave()` (line 455) |
| Final save | `PDFSigning.tsx` | `handleSave()` (line 58) |

---

## 🔍 Debugging Tips

1. **PDF not filling?** Check `FederalTimeTable.handleViewPDF()` console logs
2. **PDF not loading?** Check `EmbedPDFViewer` useEffect logs (lines 100-429)
3. **Annotations not saving?** Check `exportPDF()` function logs (line 1021)
4. **Blob URL issues?** Check blob URL creation and accessibility tests (lines 336-354)

---

This breakdown should help you navigate the codebase and understand the complete PDF lifecycle!

