import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as PDFLib from 'pdf-lib';
import type { FederalEquipmentEntry, FederalPersonnelEntry, FederalFormData } from '../utils/engineTimeDB';
import { getPDF, storePDFWithId } from '../utils/pdfStorage';
import { mapFederalToPDFFields, validateFederalFormData, getFederalPDFFieldName } from '../utils/fieldmapper/federalFieldMapper';
import { derivePdfIdFromDate, normalizeDate } from '../utils/pdfIdResolver';

interface UsePDFGenerationProps {
  formData: FederalFormData;
  equipmentEntries: FederalEquipmentEntry[];
  personnelEntries: FederalPersonnelEntry[];
  checkboxStates: {
    noMealsLodging: boolean;
    noMeals: boolean;
    travel: boolean;
    noLunch: boolean;
    hotline: boolean;
  };
  currentSelectedDate: string;
}

/**
 * Utility function to convert Date to MM/DD/YY format
 */
const formatToMMDDYY = (date: Date): string => {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  return `${month}/${day}/${year}`;
};

export const usePDFGeneration = ({
  formData,
  equipmentEntries,
  personnelEntries,
  checkboxStates,
  currentSelectedDate
}: UsePDFGenerationProps) => {
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatePDF = async () => {
    try {
      setIsGenerating(true);
      setError(null);
      
      console.log('Federal: Starting PDF fill and sign process...');
      
      // Validate form data
      const validation = validateFederalFormData(formData, equipmentEntries, personnelEntries);
      if (!validation.isValid) {
        console.error('Federal: Form validation failed:', validation.errors);
        const errorMessage = 'Please fill in required fields before signing: ' + validation.errors.join(', ');
        setError(errorMessage);
        alert(errorMessage);
        return;
      }

      // Map form data to PDF fields
      console.log('🔍 DEBUG: Equipment entries being mapped:', equipmentEntries);
      console.log('🔍 DEBUG: Personnel entries being mapped:', personnelEntries);
      const pdfFields = mapFederalToPDFFields(formData, equipmentEntries, personnelEntries, checkboxStates);
      console.log('Federal: Mapped PDF fields:', pdfFields);
      
      // Debug time-related fields specifically
      const timeFields = Object.entries(pdfFields).filter(([key]) => 
        key.includes('DateRow') || key.includes('StartRow') || key.includes('StopRow') || key.includes('TotalRow')
      );
      console.log('🔍 DEBUG: Time-related fields being mapped:', timeFields);
      console.log('Federal: Current form data remarks:', formData.remarks);
      console.log('Federal: Checkbox states:', checkboxStates);
      console.log('Federal: PDF remarks field value:', pdfFields[getFederalPDFFieldName('remarks')]);

      // Get the stored PDF
      const storedPDF = await getPDF('federal-form');
      if (!storedPDF) {
        console.error('Federal: No PDF found in storage');
        const errorMessage = 'PDF not found. Please try again.';
        setError(errorMessage);
        alert(errorMessage);
        return;
      }

      // Create a new PDF with filled fields
      const pdfDoc = await PDFLib.PDFDocument.load(await storedPDF.pdf.arrayBuffer());
      
      // Get the form
      const form = pdfDoc.getForm();
      
      // DEBUG: Extract all field names from the PDF
      console.log('🔍 DEBUG: Extracting all field names from Federal PDF...');
      const fields = form.getFields();
      console.log('🔍 DEBUG: Total fields found:', fields.length);
      console.log('🔍 DEBUG: All field names:');
      fields.forEach((field, index) => {
        const fieldName = field.getName();
        const fieldType = field.constructor.name;
        console.log(`${index + 1}. "${fieldName}" (${fieldType})`);
      });
      
      // Look for specific fields we're trying to map
      console.log('🔍 DEBUG: Looking for specific fields...');
      const searchTerms = ['Agreement', 'Contractor', 'Resource', 'Incident', 'Equipment', 'Serial', 'License', 'Agency', 'Supervisor', 'Remarks'];
      const matchingFields = fields.filter(field => {
        const fieldName = field.getName();
        return searchTerms.some(term => fieldName.includes(term));
      });
      
      if (matchingFields.length > 0) {
        console.log('🔍 DEBUG: Fields matching search terms:');
        matchingFields.forEach(field => {
          console.log(`- "${field.getName()}" (${field.constructor.name})`);
        });
      } else {
        console.log('🔍 DEBUG: No fields found matching search terms');
      }
      
      // Fill the form fields
      let filledFieldsCount = 0;
      let attemptedFieldsCount = 0;
      console.log('🔍 DEBUG: Attempting to fill fields...');
      Object.entries(pdfFields).forEach(([fieldName, value]) => {
        attemptedFieldsCount++;
        console.log(`🔍 DEBUG: Attempting field "${fieldName}" with value "${value}"`);
        
        // Special debugging for time-related fields
        if (fieldName.includes('DateRow') || fieldName.includes('StartRow') || fieldName.includes('StopRow') || fieldName.includes('TotalRow')) {
          console.log(`🔍 DEBUG: TIME FIELD - ${fieldName} = "${value}"`);
        }
        
        try {
          const field = form.getField(fieldName);
          if (field) {
            console.log(`🔍 DEBUG: Field "${fieldName}" found, type: ${field.constructor.name}`);
            // More robust field type detection that works in production builds
            const hasSetText = typeof (field as any).setText === 'function';
            const hasCheck = typeof (field as any).check === 'function';
            const hasSelect = typeof (field as any).select === 'function';
            const hasSetValue = typeof (field as any).setValue === 'function';
            
            if (hasSetText) {
              // Text field
              (field as any).setText(value);
              filledFieldsCount++;
              console.log(`Federal: Filled text field ${fieldName} with value: ${value}`);
            } else if (hasCheck) {
              // Checkbox field
              if (value === 'Yes' || value === 'On' || value === 'YES' || value === 'HOURS') {
                (field as any).check();
              } else {
                (field as any).uncheck();
              }
              filledFieldsCount++;
              console.log(`Federal: Filled checkbox ${fieldName} with value: ${value}`);
            } else if (hasSelect) {
              // Dropdown field
              (field as any).select(value);
              filledFieldsCount++;
              console.log(`Federal: Filled dropdown ${fieldName} with value: ${value}`);
            } else if (hasSetValue) {
              // Generic field with setValue method
              (field as any).setValue(value);
              filledFieldsCount++;
              console.log(`Federal: Filled field ${fieldName} with value: ${value} using setValue`);
            } else {
              // Try to set the field value directly
              try {
                (field as any).value = value;
                filledFieldsCount++;
                console.log(`Federal: Filled field ${fieldName} with value: ${value} using direct assignment`);
              } catch (directError) {
                console.warn(`Federal: Field ${fieldName} found but no suitable method available. Available methods: ${Object.getOwnPropertyNames(field).join(', ')}`);
              }
            }
          } else {
            console.warn(`Federal: Field ${fieldName} not found in PDF`);
            // Special debugging for missing fields
            if (fieldName.includes('Agency_Representative') || fieldName.includes('Incident_Supervisor')) {
              console.error(`Federal: DEBUG - Field ${fieldName} NOT FOUND in PDF! This field may not exist.`);
            }
          }
        } catch (error) {
          console.error(`Federal: Error filling field ${fieldName}:`, error);
        }
      });
      
      console.log(`Federal: Successfully filled ${filledFieldsCount} fields out of ${attemptedFieldsCount} attempted`);

      // CRITICAL: Update field appearances before flattening
      // PDF form fields have "appearance streams" that define how they look
      // If we don't update these after filling, the flattened PDF won't show the filled values
      // This is the key issue - without updating appearances, flattening won't render the values
      // The web search revealed this is a common issue: form fields need their appearance streams
      // updated after filling, otherwise flattening won't include the filled values in the rendered content
      try {
        console.log('🔍 Federal: Updating field appearances to make filled values visible...');
        // Try to get an existing font from the PDF, or use a standard one
        let font;
        try {
          // Try to get Helvetica (standard PDF font)
          font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
        } catch (fontError) {
          console.warn('⚠️ Federal: Could not embed font, trying without font parameter');
          font = undefined;
        }
        
        // Update field appearances - this generates the visual representation of filled fields
        // This is CRITICAL - without this, flattening won't include the filled values
        if (font) {
          form.updateFieldAppearances(font);
        } else {
          // Try without font parameter (pdf-lib may use default)
          (form as any).updateFieldAppearances?.();
        }
        console.log('✅ Federal: Field appearances updated successfully');
      } catch (appearanceError) {
        console.error('❌ Federal: CRITICAL - Could not update field appearances:', appearanceError);
        console.error('❌ Federal: Without updating appearances, flattened PDF will NOT show filled values!');
        // This is critical - if we can't update appearances, the flattened PDF won't show values
        // But let's continue and see if flattening still works
      }

      // NOTE: We do NOT flatten here - form fields must remain intact for editing/signing
      // Flattening will happen when the user saves/signs the PDF (in the save handler)
      // This ensures the PDF can be filled again if needed and form fields remain editable

      // Save the filled PDF
      const pdfBytes = await pdfDoc.save();
      // Convert Uint8Array to ArrayBuffer to avoid type issues
      const arrayBuffer = pdfBytes.buffer instanceof ArrayBuffer 
        ? pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength)
        : new Uint8Array(pdfBytes).buffer;
      const filledPdfBlob = new Blob([arrayBuffer], { type: 'application/pdf' });
      
      // Validate the PDF blob before storing
      if (!filledPdfBlob || filledPdfBlob.size === 0) {
        throw new Error('Failed to create PDF blob: blob is empty');
      }
      
      // Verify PDF header
      const testSlice = filledPdfBlob.slice(0, 4);
      const testArray = await testSlice.arrayBuffer();
      const testBytes = new Uint8Array(testArray);
      const pdfHeader = String.fromCharCode(...testBytes);
      if (pdfHeader !== '%PDF') {
        throw new Error(`Invalid PDF format: blob does not contain valid PDF header (got: ${pdfHeader})`);
      }
      
      console.log('✅ Federal: PDF blob validated, size:', filledPdfBlob.size, 'bytes');
      
      // Verify the filled PDF actually has filled fields before storing
      console.log('🔍 Federal: Verifying filled PDF before storing...');
      const verifyBlobCopy = filledPdfBlob.slice(0);
      const verifyFilledDoc = await PDFLib.PDFDocument.load(await verifyBlobCopy.arrayBuffer());
      const verifyForm = verifyFilledDoc.getForm();
      const verifyFields = verifyForm.getFields();
      
      let verifyFilledCount = 0;
      
      // Check if fields are filled (form fields should still exist since we didn't flatten)
      if (verifyFields.length === 0) {
        console.warn('⚠️ Federal: PDF has no form fields - may have been flattened previously');
        verifyFilledCount = filledFieldsCount; // Use the count from before
      } else {
        // Form wasn't flattened, check if fields are filled
        verifyFields.forEach(field => {
          try {
            if (field.constructor.name === 'PDFTextField') {
              const text = (field as any).getText();
              if (text && text.trim().length > 0) {
                verifyFilledCount++;
                console.log(`✅ Federal: Verified filled field "${field.getName()}" = "${text}"`);
              }
            } else if (field.constructor.name === 'PDFCheckBox') {
              if ((field as any).isChecked()) {
                verifyFilledCount++;
                console.log(`✅ Federal: Verified checked field "${field.getName()}"`);
              }
            }
          } catch (e) {
            // Ignore field errors
          }
        });
        console.log(`🔍 Federal: Verification complete - ${verifyFilledCount} filled fields found in saved PDF`);
        
        if (verifyFilledCount === 0 && verifyFields.length > 0) {
          console.error('❌ Federal: CRITICAL - Saved PDF has NO filled fields! The PDF will appear blank.');
          throw new Error('PDF was saved but no fields were filled. Please check the field mapping.');
        }
      }
      
      // Use centralized resolver to create date-specific PDF ID
      const formDate = normalizeDate(currentSelectedDate || formatToMMDDYY(new Date()));
      const dateSpecificPdfId = derivePdfIdFromDate(formDate, 'federal');
      
      console.log('🔍 usePDFGeneration: Derived PDF ID:', dateSpecificPdfId, 'from date:', formDate);
      
      // Store the filled PDF with date-specific ID
      await storePDFWithId(dateSpecificPdfId, filledPdfBlob, null, {
        filename: 'OF297-24-filled.pdf',
        date: formDate,
        crewNumber: formData.agreementNumber || 'N/A',
        fireName: formData.incidentName || 'N/A',
        fireNumber: formData.incidentNumber || 'N/A'
      });

      console.log('✅ Federal: PDF filled and stored successfully with', verifyFilledCount, 'filled fields, navigating to signing page...');
      console.log('🔍 Federal: Stored PDF with date-specific ID:', dateSpecificPdfId, 'for date:', formDate);
      
      // Navigate to PDF signing page with parameters
      const params = new URLSearchParams({
        pdfId: dateSpecificPdfId,
        crewNumber: formData.agreementNumber || 'N/A',
        fireName: formData.incidentName || 'N/A',
        fireNumber: formData.incidentNumber || 'N/A',
        date: formDate
      });
      
      navigate(`/pdf-signing?${params.toString()}`);
      
    } catch (err) {
      console.error('Federal: Error filling PDF:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error filling PDF. Please check the console for details.';
      setError(errorMessage);
      alert(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  return { generatePDF, isGenerating, error };
};

