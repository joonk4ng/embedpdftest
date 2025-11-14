import * as PDFLib from 'pdf-lib';
import { getPDF } from './pdfStorage';

/**
 * Debug function to check original PDF from public folder
 */
export const debugOriginalPDF = async (): Promise<void> => {
  try {
    console.log('🔍 DEBUG: Checking original PDF from public folder...');
    const response = await fetch('/OF297-24.pdf');
    if (!response.ok) {
      console.error('Failed to fetch original PDF:', response.status);
      alert('Failed to fetch original PDF from public folder.');
      return;
    }

    const pdfBlob = await response.blob();
    console.log('🔍 DEBUG: Original PDF fetched:', {
      size: pdfBlob.size,
      type: pdfBlob.type
    });

    const pdfDoc = await PDFLib.PDFDocument.load(await pdfBlob.arrayBuffer());
    console.log('🔍 DEBUG: Original PDF loaded:', {
      pageCount: pdfDoc.getPageCount(),
      title: pdfDoc.getTitle(),
      author: pdfDoc.getAuthor()
    });

    const form = pdfDoc.getForm();
    
    // Check if this is an XFA form
    try {
      const formType = (form as any).getFormType?.();
      console.log('🔍 DEBUG: Original PDF form type:', formType);
      if (formType === 'XFA') {
        console.log('🔍 DEBUG: Original PDF is also XFA format!');
        alert('The original PDF is also in XFA format.\n\nYou need to convert it to AcroForm format in Adobe Acrobat:\n1. Open PDF in Acrobat\n2. Tools → Prepare Form\n3. More → Convert to AcroForm\n4. Save the PDF');
        return;
      }
    } catch (error) {
      console.log('🔍 DEBUG: Could not determine original PDF form type:', error);
    }
    
    const fields = form.getFields();
    console.log('🔍 DEBUG: Original PDF fields found:', fields.length);
    if (fields.length > 0) {
      console.log('🔍 DEBUG: Original PDF field names:');
      fields.forEach((field, index) => {
        const fieldName = field.getName();
        const fieldType = field.constructor.name;
        console.log(`${index + 1}. "${fieldName}" (${fieldType})`);
      });
      alert(`Original PDF has ${fields.length} form fields!\n\nThis means your resized PDF lost its form fields.\nCheck console for field names.`);
    } else {
      alert('Original PDF also has no form fields. This is unexpected.');
    }
    
  } catch (error) {
    console.error('Error checking original PDF:', error);
    alert('Error checking original PDF. Check console for details.');
  }
};

/**
 * Debug function to extract PDF field names from stored PDF
 */
export const debugPDFFields = async (): Promise<void> => {
  try {
    console.log('🔍 DEBUG: Starting PDF field extraction...');
    const storedPDF = await getPDF('federal-form');
    if (!storedPDF) {
      console.error('Federal: No PDF found in storage');
      alert('PDF not found. Please try again.');
      return;
    }

    console.log('🔍 DEBUG: PDF found in storage:', {
      id: storedPDF.id,
      filename: storedPDF.metadata.filename,
      size: storedPDF.pdf.size,
      type: storedPDF.pdf.type
    });

    const pdfDoc = await PDFLib.PDFDocument.load(await storedPDF.pdf.arrayBuffer());
    console.log('🔍 DEBUG: PDF loaded successfully:', {
      pageCount: pdfDoc.getPageCount(),
      title: pdfDoc.getTitle(),
      author: pdfDoc.getAuthor(),
      subject: pdfDoc.getSubject()
    });

    const form = pdfDoc.getForm();
    console.log('🔍 DEBUG: Form object created:', form);
    
    // Check if this is an XFA form
    try {
      const formType = (form as any).getFormType?.();
      console.log('🔍 DEBUG: Form type:', formType);
      if (formType === 'XFA') {
        console.log('🔍 DEBUG: This is an XFA form! PDF-lib cannot handle XFA forms.');
        alert('This PDF is in XFA format, which PDF-lib cannot handle.\n\nYou need to convert it to AcroForm format in Adobe Acrobat:\n1. Open PDF in Acrobat\n2. Tools → Prepare Form\n3. More → Convert to AcroForm\n4. Save the PDF');
        return;
      }
    } catch (error) {
      console.log('🔍 DEBUG: Could not determine form type:', error);
    }
    
    const fields = form.getFields();
    console.log('🔍 DEBUG: Fields array:', fields);
    console.log('🔍 DEBUG: Total fields found:', fields.length);
    
    if (fields.length === 0) {
      console.log('🔍 DEBUG: No form fields found. This could mean:');
      console.log('1. The PDF has no form fields (static PDF)');
      console.log('2. The PDF was flattened during resizing');
      console.log('3. The PDF is corrupted');
      
      // Try to get more info about the PDF structure
      const pages = pdfDoc.getPages();
      console.log('🔍 DEBUG: PDF pages:', pages.length);
      pages.forEach((page, index) => {
        console.log(`Page ${index + 1}:`, {
          width: page.getWidth(),
          height: page.getHeight(),
          rotation: page.getRotation()
        });
      });
      
      alert(`No form fields found in PDF!\n\nThis usually means:\n1. PDF has no form fields (static PDF)\n2. PDF was flattened during resizing\n3. PDF is corrupted\n\nCheck console for more details.`);
      return;
    }
    
    console.log('🔍 DEBUG: All field names:');
    fields.forEach((field, index) => {
      const fieldName = field.getName();
      const fieldType = field.constructor.name;
      console.log(`${index + 1}. "${fieldName}" (${fieldType})`);
    });
    
    // Also log to alert for easy copying
    const fieldNames = fields.map(field => field.getName()).join('\n');
    alert(`Found ${fields.length} fields. Check console for details.\n\nFirst 10 fields:\n${fieldNames.split('\n').slice(0, 10).join('\n')}`);
    
  } catch (error) {
    console.error('Error extracting PDF fields:', error);
    alert('Error extracting PDF fields. Check console for details.');
  }
};

