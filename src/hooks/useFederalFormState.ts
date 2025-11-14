import { useState } from 'react';
import type { FederalEquipmentEntry, FederalPersonnelEntry, FederalFormData } from '../utils/engineTimeDB';

export const useFederalFormState = () => {
  // Federal form data state
  const [federalFormData, setFederalFormData] = useState<FederalFormData>({
    agreementNumber: '',
    contractorAgencyName: '',
    resourceOrderNumber: '',
    incidentName: '',
    incidentNumber: '',
    financialCode: '',
    equipmentMakeModel: '',
    equipmentType: '',
    serialVinNumber: '',
    licenseIdNumber: '',
    transportRetained: '',
    isFirstLastTicket: '',
    rateType: '',
    agencyRepresentative: '',
    incidentSupervisor: '',
    remarks: '',
    checkboxStates: {
      noMealsLodging: false,
      noMeals: false,
      travel: false,
      noLunch: false,
      hotline: true  // Default to true
    }
  });

  // Equipment entries state
  const [equipmentEntries, setEquipmentEntries] = useState<FederalEquipmentEntry[]>([]);

  // Personnel entries state
  const [personnelEntries, setPersonnelEntries] = useState<FederalPersonnelEntry[]>([]);

  // Calendar state
  const [calendarOpen, setCalendarOpen] = useState<{
    type: 'equipment' | 'personnel';
    index: number;
  } | null>(null);

  // Main calendar state
  const [showMainCalendar, setShowMainCalendar] = useState(false);
  const [currentSelectedDate, setCurrentSelectedDate] = useState<string>('');
  const [savedDates, setSavedDates] = useState<string[]>([]);

  // Time validation state
  const [timeValidationErrors, setTimeValidationErrors] = useState<Record<string, string>>({});

  // Add state for collapsible sections
  const [checkboxStates, setCheckboxStates] = useState({
    noMealsLodging: false,
    noMeals: false,
    travel: false,
    noLunch: false,
    hotline: true  // Default to true
  });

  // Add state for unsaved changes and saving status
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);

  // Add state for stored PDFs and preview
  const [storedPDFs, setStoredPDFs] = useState<any[]>([]);
  const [showPDFPreview, setShowPDFPreview] = useState(false);
  const [previewPDF, setPreviewPDF] = useState<{ pdf: Blob; preview: Blob | null; metadata: any } | null>(null);

  return {
    // Form data
    federalFormData,
    setFederalFormData,
    
    // Entries
    equipmentEntries,
    setEquipmentEntries,
    personnelEntries,
    setPersonnelEntries,
    
    // Calendar
    calendarOpen,
    setCalendarOpen,
    showMainCalendar,
    setShowMainCalendar,
    currentSelectedDate,
    setCurrentSelectedDate,
    savedDates,
    setSavedDates,
    
    // Validation
    timeValidationErrors,
    setTimeValidationErrors,
    
    // Checkboxes
    checkboxStates,
    setCheckboxStates,
    
    // Saving status
    hasUnsavedChanges,
    setHasUnsavedChanges,
    isSaving,
    setIsSaving,
    lastSaved,
    setLastSaved,
    
    // PDF preview
    storedPDFs,
    setStoredPDFs,
    showPDFPreview,
    setShowPDFPreview,
    previewPDF,
    setPreviewPDF
  };
};

