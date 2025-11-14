import { useCallback } from 'react';
import type { FederalEquipmentEntry, FederalPersonnelEntry, FederalFormData } from '../utils/engineTimeDB';
import {
  saveFederalEquipmentEntry,
  loadAllFederalEquipmentEntries,
  deleteFederalEquipmentEntry,
  saveFederalPersonnelEntry,
  loadAllFederalPersonnelEntries,
  deleteFederalPersonnelEntry,
  saveFederalFormData,
  loadFederalFormData
} from '../utils/engineTimeDB';

/**
 * Utility function to convert MM/DD/YY to Date object
 */
const parseMMDDYY = (dateStr: string): Date => {
  const [month, day, year] = dateStr.split('/');
  const fullYear = 2000 + parseInt(year);
  return new Date(fullYear, parseInt(month) - 1, parseInt(day));
};

/**
 * Utility function to convert Date to MM/DD/YY format
 */
const formatToMMDDYY = (date: Date): string => {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  return `${month}/${day}/${year}`;
};

interface UseDateManagementProps {
  currentSelectedDate: string;
  equipmentEntries: FederalEquipmentEntry[];
  personnelEntries: FederalPersonnelEntry[];
  federalFormData: FederalFormData;
  setCurrentSelectedDate: (date: string) => void;
  setEquipmentEntries: (entries: FederalEquipmentEntry[]) => void;
  setPersonnelEntries: (entries: FederalPersonnelEntry[]) => void;
  setFederalFormData: (data: FederalFormData) => void;
  setCheckboxStates: (states: {
    noMealsLodging: boolean;
    noMeals: boolean;
    travel: boolean;
    noLunch: boolean;
    hotline: boolean;
  }) => void;
  setSavedDates: (dates: string[]) => void;
}

export const useDateManagement = ({
  currentSelectedDate,
  equipmentEntries,
  personnelEntries,
  federalFormData,
  setCurrentSelectedDate,
  setEquipmentEntries,
  setPersonnelEntries,
  setFederalFormData,
  setCheckboxStates,
  setSavedDates
}: UseDateManagementProps) => {
  
  const refreshSavedDates = useCallback(async () => {
    try {
      // Load all equipment and personnel entries to get all dates
      const allEquipmentEntries = await loadAllFederalEquipmentEntries();
      const allPersonnelEntries = await loadAllFederalPersonnelEntries();
      
      // Collect all unique dates
      const allDates = new Set<string>();
      allEquipmentEntries.forEach(entry => entry.date && allDates.add(entry.date));
      allPersonnelEntries.forEach(entry => entry.date && allDates.add(entry.date));
      
      setSavedDates(Array.from(allDates));
      console.log('Refreshed saved dates:', Array.from(allDates));
    } catch (error) {
      console.error('Error refreshing saved dates:', error);
    }
  }, [setSavedDates]);

  const loadDataForDate = useCallback(async (dateRange: string) => {
    try {
      console.log('🔍 Loading data for date range:', dateRange);
      
      // Load form data (singleton)
      const formData = await loadFederalFormData();
      if (formData) {
        setFederalFormData(formData);
        
        // Load checkbox states from form data
        if (formData.checkboxStates) {
          setCheckboxStates(formData.checkboxStates);
          console.log('Loaded checkbox states for date:', dateRange, formData.checkboxStates);
        }
      }

      // Load equipment entries for the specific date
      const allEquipmentEntries = await loadAllFederalEquipmentEntries();
      console.log('🔍 All equipment entries from IndexedDB:', allEquipmentEntries);
      const dateEquipmentEntries = allEquipmentEntries.filter(entry => entry.date === dateRange);
      console.log('🔍 Filtered equipment entries for date', dateRange, ':', dateEquipmentEntries);
      
      // If no equipment entries exist for this date, create a default entry with preset times
      if (dateEquipmentEntries.length === 0) {
        const defaultEquipmentEntry: FederalEquipmentEntry = {
          date: dateRange,
          start: '', // Legacy field
          stop: '', // Legacy field
          start1: '0700', // Default start time 1
          stop1: '1200',  // Default stop time 1
          start2: '1230', // Default start time 2
          stop2: '1900',  // Default stop time 2
          total: '', // Will be calculated automatically
          quantity: '',
          type: '',
          remarks: ''
        };
        console.log('🔍 Created default equipment entry with preset times:', defaultEquipmentEntry);
        setEquipmentEntries([defaultEquipmentEntry]);
      } else {
        setEquipmentEntries(dateEquipmentEntries);
      }

      // Load personnel entries for the specific date
      const allPersonnelEntries = await loadAllFederalPersonnelEntries();
      console.log('🔍 All personnel entries from IndexedDB:', allPersonnelEntries);
      const datePersonnelEntries = allPersonnelEntries.filter(entry => entry.date === dateRange);
      console.log('🔍 Filtered personnel entries for date', dateRange, ':', datePersonnelEntries);
      
      // If no personnel entries exist for this date, create a default entry with preset times
      if (datePersonnelEntries.length === 0) {
        const defaultPersonnelEntry: FederalPersonnelEntry = {
          date: dateRange,
          name: '',
          start1: '0700', // Default start time 1
          stop1: '1200',  // Default stop time 1
          start2: '1230', // Default start time 2
          stop2: '1900',  // Default stop time 2
          total: '', // Will be calculated automatically
          remarks: ''
        };
        console.log('🔍 Created default personnel entry with preset times:', defaultPersonnelEntry);
        setPersonnelEntries([defaultPersonnelEntry]);
      } else {
        setPersonnelEntries(datePersonnelEntries);
      }
    } catch (error) {
      console.error('Error loading data for date:', error);
    }
  }, [setFederalFormData, setCheckboxStates, setEquipmentEntries, setPersonnelEntries]);

  const saveDataForDate = useCallback(async () => {
    try {
      // Ensure we have a date to save to
      const dateToSave = currentSelectedDate || formatToMMDDYY(new Date());
      
      console.log('Saving data for date:', dateToSave);
      console.log('Equipment entries to save:', equipmentEntries.length);
      console.log('Personnel entries to save:', personnelEntries.length);
      console.log('Current selected date:', currentSelectedDate);
      console.log('Equipment entries:', equipmentEntries);
      console.log('Personnel entries:', personnelEntries);
      
      // Save current form data
      await saveFederalFormData(federalFormData);
      
      // Save equipment entries - only save entries that belong to the current date
      for (const entry of equipmentEntries) {
        // Only save entries that match the current selected date
        if (entry.date === dateToSave) {
          await saveFederalEquipmentEntry(entry);
          console.log('Saved equipment entry for date:', dateToSave, 'with content:', {
            start: entry.start,
            stop: entry.stop,
            total: entry.total,
            quantity: entry.quantity,
            type: entry.type,
            remarks: entry.remarks
          });
        } else {
          console.log('Skipped equipment entry - different date:', entry.date, 'vs', dateToSave);
        }
      }
      
      // Save personnel entries - only save entries that belong to the current date
      for (const entry of personnelEntries) {
        // Only save entries that match the current selected date
        if (entry.date === dateToSave) {
          await saveFederalPersonnelEntry(entry);
          console.log('Saved personnel entry for date:', dateToSave, 'with content:', {
            name: entry.name,
            start1: entry.start1,
            stop1: entry.stop1,
            start2: entry.start2,
            stop2: entry.stop2,
            total: entry.total,
            remarks: entry.remarks
          });
        } else {
          console.log('Skipped personnel entry - different date:', entry.date, 'vs', dateToSave);
        }
      }
      
      // Refresh the saved dates list
      await refreshSavedDates();
      
      console.log('Data saved for date:', dateToSave);
    } catch (error) {
      console.error('Error saving data for date:', error);
    }
  }, [currentSelectedDate, equipmentEntries, personnelEntries, federalFormData, refreshSavedDates]);

  const copyDataToNextDay = useCallback(async (nextDateString: string) => {
    try {
      // Copy form data (it's a singleton, so we keep the same form data)
      // The form data doesn't need to be copied as it's shared across dates
      
      // Get all existing entries for the next day to clear them first
      const allEquipmentEntries = await loadAllFederalEquipmentEntries();
      const allPersonnelEntries = await loadAllFederalPersonnelEntries();
      
      // Clear existing entries for the next day
      const existingEquipmentForNextDay = allEquipmentEntries.filter(entry => entry.date === nextDateString);
      const existingPersonnelForNextDay = allPersonnelEntries.filter(entry => entry.date === nextDateString);
      
      // Delete existing entries for the next day
      for (const entry of existingEquipmentForNextDay) {
        if (entry.id) {
          await deleteFederalEquipmentEntry(entry.id);
        }
      }
      
      for (const entry of existingPersonnelForNextDay) {
        if (entry.id) {
          await deleteFederalPersonnelEntry(entry.id);
        }
      }
      
      // Copy equipment entries with one-to-one mapping
      const newEquipmentEntries = equipmentEntries.map(entry => ({
        ...entry,
        id: undefined, // Remove ID so it creates a new entry
        date: nextDateString
      }));
      
      // Copy personnel entries with one-to-one mapping
      const newPersonnelEntries = personnelEntries.map(entry => ({
        ...entry,
        id: undefined, // Remove ID so it creates a new entry
        date: nextDateString
      }));
      
      // Save the new entries in order (maintaining one-to-one mapping)
      for (const entry of newEquipmentEntries) {
        if (entry.date || entry.start || entry.stop || entry.total || entry.quantity || entry.type || entry.remarks) {
          await saveFederalEquipmentEntry(entry);
        }
      }
      
      for (const entry of newPersonnelEntries) {
        if (entry.date || entry.name || entry.start1 || entry.stop1 || entry.start2 || entry.stop2 || entry.total || entry.remarks) {
          await saveFederalPersonnelEntry(entry);
        }
      }
      
      // Refresh the saved dates list
      await refreshSavedDates();
      
      console.log('Data copied to next day with one-to-one mapping successfully');
    } catch (error) {
      console.error('Error copying data to next day:', error);
    }
  }, [equipmentEntries, personnelEntries, refreshSavedDates]);

  const handleNextDay = useCallback(async () => {
    try {
      // Get the current date from the selected date or first equipment entry, or use today's date
      let currentDate = new Date();
      if (currentSelectedDate) {
        // Check if currentSelectedDate is in MM/DD/YY format
        if (currentSelectedDate.includes('/')) {
          currentDate = parseMMDDYY(currentSelectedDate);
        } else {
          currentDate = new Date(currentSelectedDate);
        }
      } else if (equipmentEntries.length > 0 && equipmentEntries[0].date) {
        if (equipmentEntries[0].date.includes('/')) {
          currentDate = parseMMDDYY(equipmentEntries[0].date);
        } else {
          currentDate = new Date(equipmentEntries[0].date);
        }
      }
      
      // Add one day
      const nextDate = new Date(currentDate);
      nextDate.setDate(nextDate.getDate() + 1);
      
      // Convert to MM/DD/YY format to maintain consistency
      const nextDateString = formatToMMDDYY(nextDate);
      
      // First, save the current data for the current selected date
      await saveDataForDate();
      
      // Copy all current data to the next day
      await copyDataToNextDay(nextDateString);
      
      // Set the new date as current and load it
      setCurrentSelectedDate(nextDateString);
      await loadDataForDate(nextDateString);
      
      console.log('Data saved for current date and copied to next day:', nextDateString);
    } catch (error) {
      console.error('Error creating next day:', error);
    }
  }, [currentSelectedDate, equipmentEntries, saveDataForDate, copyDataToNextDay, loadDataForDate, setCurrentSelectedDate]);

  return {
    handleNextDay,
    copyDataToNextDay,
    loadDataForDate,
    saveDataForDate,
    refreshSavedDates,
    formatToMMDDYY,
    parseMMDDYY
  };
};

