import { useCallback } from 'react';
import { parsePayloadFromURL, createShareableLink, clearURLParameters, type FederalPayload } from '../utils/payloadSystem';
import type { FederalFormData, FederalEquipmentEntry, FederalPersonnelEntry } from '../utils/engineTimeDB';
import { saveFederalEquipmentEntry, saveFederalPersonnelEntry } from '../utils/engineTimeDB';

interface UsePayloadManagementProps {
  federalFormData: FederalFormData;
  setFederalFormData: (data: FederalFormData | ((prev: FederalFormData) => FederalFormData)) => void;
  equipmentEntries: FederalEquipmentEntry[];
  setEquipmentEntries: (entries: FederalEquipmentEntry[] | ((prev: FederalEquipmentEntry[]) => FederalEquipmentEntry[])) => void;
  personnelEntries: FederalPersonnelEntry[];
  setPersonnelEntries: (entries: FederalPersonnelEntry[] | ((prev: FederalPersonnelEntry[]) => FederalPersonnelEntry[])) => void;
  checkboxStates: {
    noMealsLodging: boolean;
    noMeals: boolean;
    travel: boolean;
    noLunch: boolean;
    hotline: boolean;
  };
  setCheckboxStates: (states: {
    noMealsLodging: boolean;
    noMeals: boolean;
    travel: boolean;
    noLunch: boolean;
    hotline: boolean;
  } | ((prev: {
    noMealsLodging: boolean;
    noMeals: boolean;
    travel: boolean;
    noLunch: boolean;
    hotline: boolean;
  }) => {
    noMealsLodging: boolean;
    noMeals: boolean;
    travel: boolean;
    noLunch: boolean;
    hotline: boolean;
  })) => void;
  currentSelectedDate: string;
  setCurrentSelectedDate: (date: string) => void;
}

/**
 * Hook for managing payload operations (parsing, applying, and generating shareable links)
 */
export const usePayloadManagement = ({
  federalFormData,
  setFederalFormData,
  equipmentEntries,
  setEquipmentEntries,
  personnelEntries,
  setPersonnelEntries,
  checkboxStates,
  setCheckboxStates,
  currentSelectedDate,
  setCurrentSelectedDate
}: UsePayloadManagementProps) => {
  /**
   * Apply payload data to form state
   */
  const applyPayloadToForm = useCallback(async (payload: FederalPayload) => {
    console.log('Applying payload to form:', payload);
    
    // Apply form data with individual state updates to ensure they take effect
    if (payload.agreementNumber) {
      console.log('Setting agreementNumber:', payload.agreementNumber);
      setFederalFormData(prev => ({ ...prev, agreementNumber: payload.agreementNumber! }));
    }
    if (payload.contractorAgencyName) {
      console.log('Setting contractorAgencyName:', payload.contractorAgencyName);
      setFederalFormData(prev => ({ ...prev, contractorAgencyName: payload.contractorAgencyName! }));
    }
    if (payload.resourceOrderNumber) {
      console.log('Setting resourceOrderNumber:', payload.resourceOrderNumber);
      setFederalFormData(prev => ({ ...prev, resourceOrderNumber: payload.resourceOrderNumber! }));
    }
    if (payload.incidentName) {
      console.log('Setting incidentName:', payload.incidentName);
      setFederalFormData(prev => ({ ...prev, incidentName: payload.incidentName! }));
    }
    if (payload.incidentNumber) {
      console.log('Setting incidentNumber:', payload.incidentNumber);
      setFederalFormData(prev => ({ ...prev, incidentNumber: payload.incidentNumber! }));
    }
    if (payload.financialCode) {
      console.log('Setting financialCode:', payload.financialCode);
      setFederalFormData(prev => ({ ...prev, financialCode: payload.financialCode! }));
    }
    if (payload.equipmentMakeModel) {
      console.log('Setting equipmentMakeModel:', payload.equipmentMakeModel);
      setFederalFormData(prev => ({ ...prev, equipmentMakeModel: payload.equipmentMakeModel! }));
    }
    if (payload.equipmentType) {
      console.log('Setting equipmentType:', payload.equipmentType);
      setFederalFormData(prev => ({ ...prev, equipmentType: payload.equipmentType! }));
    }
    if (payload.serialVinNumber) {
      console.log('Setting serialVinNumber:', payload.serialVinNumber);
      setFederalFormData(prev => ({ ...prev, serialVinNumber: payload.serialVinNumber! }));
    }
    if (payload.licenseIdNumber) {
      console.log('Setting licenseIdNumber:', payload.licenseIdNumber);
      setFederalFormData(prev => ({ ...prev, licenseIdNumber: payload.licenseIdNumber! }));
    }
    if (payload.transportRetained) {
      console.log('Setting transportRetained:', payload.transportRetained);
      setFederalFormData(prev => ({ ...prev, transportRetained: payload.transportRetained! }));
    }
    if (payload.isFirstLastTicket) {
      console.log('Setting isFirstLastTicket:', payload.isFirstLastTicket);
      setFederalFormData(prev => ({ ...prev, isFirstLastTicket: payload.isFirstLastTicket! }));
    }
    if (payload.rateType) {
      console.log('Setting rateType:', payload.rateType);
      setFederalFormData(prev => ({ ...prev, rateType: payload.rateType! }));
    }
    if (payload.agencyRepresentative) {
      console.log('Setting agencyRepresentative:', payload.agencyRepresentative);
      setFederalFormData(prev => ({ ...prev, agencyRepresentative: payload.agencyRepresentative! }));
    }
    if (payload.incidentSupervisor) {
      console.log('Setting incidentSupervisor:', payload.incidentSupervisor);
      setFederalFormData(prev => ({ ...prev, incidentSupervisor: payload.incidentSupervisor! }));
    }
    if (payload.remarks) {
      console.log('Setting remarks:', payload.remarks);
      setFederalFormData(prev => ({ ...prev, remarks: payload.remarks! }));
    }
    
    // Apply checkbox states
    if (payload.noMealsLodging !== undefined) {
      console.log('Setting noMealsLodging:', payload.noMealsLodging);
      setCheckboxStates(prev => ({ ...prev, noMealsLodging: payload.noMealsLodging! }));
    }
    if (payload.noMeals !== undefined) {
      console.log('Setting noMeals:', payload.noMeals);
      setCheckboxStates(prev => ({ ...prev, noMeals: payload.noMeals! }));
    }
    if (payload.travel !== undefined) {
      console.log('Setting travel:', payload.travel);
      setCheckboxStates(prev => ({ ...prev, travel: payload.travel! }));
    }
    if (payload.noLunch !== undefined) {
      console.log('Setting noLunch:', payload.noLunch);
      setCheckboxStates(prev => ({ ...prev, noLunch: payload.noLunch! }));
    }
    if (payload.hotline !== undefined) {
      console.log('Setting hotline:', payload.hotline);
      setCheckboxStates(prev => ({ ...prev, hotline: payload.hotline! }));
    }
    
    // Apply date
    if (payload.date) {
      console.log('Setting date:', payload.date);
      setCurrentSelectedDate(payload.date);
    }
    
    // Apply equipment entries
    if (payload.equipmentEntries && payload.equipmentEntries.length > 0) {
      console.log('Setting equipment entries:', payload.equipmentEntries);
      const mappedEquipmentEntries = payload.equipmentEntries.map(entry => ({
        date: entry.date || '',
        start: entry.start || '',
        stop: entry.stop || '',
        start1: entry.start1 || '',
        stop1: entry.stop1 || '',
        start2: entry.start2 || '',
        stop2: entry.stop2 || '',
        total: entry.total || '',
        quantity: entry.quantity || '',
        type: entry.type || '',
        remarks: entry.remarks || ''
      }));
      console.log('Mapped equipment entries:', mappedEquipmentEntries);
      setEquipmentEntries(mappedEquipmentEntries);
      
      // Save equipment entries to IndexedDB
      for (const entry of mappedEquipmentEntries) {
        await saveFederalEquipmentEntry(entry);
      }
    }
    
    // Apply personnel entries
    if (payload.personnelEntries && payload.personnelEntries.length > 0) {
      console.log('Setting personnel entries:', payload.personnelEntries);
      const mappedPersonnelEntries = payload.personnelEntries.map(entry => ({
        date: entry.date || '',
        name: entry.name || '',
        start1: entry.start1 || '',
        stop1: entry.stop1 || '',
        start2: entry.start2 || '',
        stop2: entry.stop2 || '',
        total: entry.total || '',
        remarks: entry.remarks || ''
      }));
      console.log('Mapped personnel entries:', mappedPersonnelEntries);
      setPersonnelEntries(mappedPersonnelEntries);
      
      // Save personnel entries to IndexedDB
      for (const entry of mappedPersonnelEntries) {
        await saveFederalPersonnelEntry(entry);
      }
    }
    
    console.log('Payload applied successfully');
  }, [
    setFederalFormData,
    setCheckboxStates,
    setCurrentSelectedDate,
    setEquipmentEntries,
    setPersonnelEntries
  ]);

  /**
   * Parse payload from URL and apply to form
   */
  const parseAndApplyPayload = useCallback(async () => {
    const payload = parsePayloadFromURL();
    if (Object.keys(payload).length > 0) {
      console.log('Payload found in URL, applying to form after data load...');
      await applyPayloadToForm(payload);
      
      // Clear URL parameters after applying payload
      setTimeout(() => {
        clearURLParameters();
      }, 1000);
    }
  }, [applyPayloadToForm]);

  /**
   * Generate shareable link from current form data
   */
  const generateShareableLink = useCallback(() => {
    const baseURL = window.location.origin + window.location.pathname;
    const shareableLink = createShareableLink(
      baseURL,
      federalFormData,
      checkboxStates,
      equipmentEntries,
      personnelEntries,
      currentSelectedDate
    );
    
    // Copy to clipboard
    navigator.clipboard.writeText(shareableLink).then(() => {
      alert('Shareable link copied to clipboard!');
    }).catch(() => {
      // Fallback: show the link in a prompt
      prompt('Shareable link (copy this):', shareableLink);
    });
  }, [federalFormData, checkboxStates, equipmentEntries, personnelEntries, currentSelectedDate]);

  return {
    applyPayloadToForm,
    parseAndApplyPayload,
    generateShareableLink
  };
};

