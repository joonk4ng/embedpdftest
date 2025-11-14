import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as PDFLib from 'pdf-lib';
import type { FederalEquipmentEntry, FederalPersonnelEntry, FederalFormData } from '../utils/engineTimeDB';
import { getPDF, storePDFWithId } from '../utils/pdfStorage';
import { mapFederalToPDFFields, validateFederalFormData, getFederalPDFFieldName } from '../utils/fieldmapper/federalFieldMapper';

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

      // Note: Removed form.flatten() due to PDF-lib compatibility issues
      // The form will remain editable, which is fine for our use case

      // Save the filled PDF
      const pdfBytes = await pdfDoc.save();
      const filledPdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
      
      // Store the filled PDF
      await storePDFWithId('federal-form', filledPdfBlob, null, {
        filename: 'OF297-24-filled.pdf',
        date: new Date().toISOString(),
        crewNumber: formData.agreementNumber || 'N/A',
        fireName: formData.incidentName || 'N/A',
        fireNumber: formData.incidentNumber || 'N/A'
      });

      console.log('Federal: PDF filled successfully, navigating to signing page...');
      
      // Navigate to PDF signing page with parameters
      const params = new URLSearchParams({
        pdfId: 'federal-form',
        crewNumber: formData.agreementNumber || 'N/A',
        fireName: formData.incidentName || 'N/A',
        fireNumber: formData.incidentNumber || 'N/A',
        date: currentSelectedDate || formatToMMDDYY(new Date())
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

