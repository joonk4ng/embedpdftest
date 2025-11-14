import { useCallback } from 'react';
import type { FederalEquipmentEntry, FederalPersonnelEntry } from '../utils/engineTimeDB';
import { saveFederalEquipmentEntry, saveFederalPersonnelEntry } from '../utils/engineTimeDB';
import { handleFederalEquipmentEntryChange, handleFederalPersonnelEntryChange, DEFAULT_PROPAGATION_CONFIG } from '../utils/entryPropagation';
import { validateTimeInput, autoCalculateTotal } from '../utils/timevalidation';

interface UseEntryHandlersProps {
  equipmentEntries: FederalEquipmentEntry[];
  personnelEntries: FederalPersonnelEntry[];
  setEquipmentEntries: (entries: FederalEquipmentEntry[] | ((prev: FederalEquipmentEntry[]) => FederalEquipmentEntry[])) => void;
  setPersonnelEntries: (entries: FederalPersonnelEntry[] | ((prev: FederalPersonnelEntry[]) => FederalPersonnelEntry[])) => void;
  setTimeValidationErrors: (errors: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  setHasUnsavedChanges: (value: boolean) => void;
}

export const useEntryHandlers = ({
  equipmentEntries,
  personnelEntries,
  setEquipmentEntries,
  setPersonnelEntries,
  setTimeValidationErrors,
  setHasUnsavedChanges
}: UseEntryHandlersProps) => {
  
  const handleEquipmentEntryChange = useCallback((index: number, field: keyof FederalEquipmentEntry, value: string) => {
    setEquipmentEntries(prev => {
      const updated = handleFederalEquipmentEntryChange(prev, index, field, value, DEFAULT_PROPAGATION_CONFIG);
      saveFederalEquipmentEntry(updated[index]);
      return updated;
    });
    setHasUnsavedChanges(true);
  }, [setEquipmentEntries, setHasUnsavedChanges]);

  const handlePersonnelEntryChange = useCallback((index: number, field: keyof FederalPersonnelEntry, value: string) => {
    setPersonnelEntries(prev => {
      let updated = handleFederalPersonnelEntryChange(prev, index, field, value, DEFAULT_PROPAGATION_CONFIG);
      
      // Auto-fill Job Title for first personnel entry
      if (index === 0 && !updated[index].remarks) {
        updated[index] = { ...updated[index], remarks: 'ENGB' };
      }
      
      // Auto-fill from equipment entry when name is entered
      if (field === 'name' && value && value.trim() !== '') {
        const equipmentEntry = equipmentEntries[0]; // Use first equipment entry as source
        if (equipmentEntry && (equipmentEntry.date || equipmentEntry.start || equipmentEntry.stop)) {
          console.log('Auto-filling personnel entry from equipment data:', {
            personnelIndex: index,
            equipmentData: {
              date: equipmentEntry.date,
              start: equipmentEntry.start,
              stop: equipmentEntry.stop
            }
          });
          
          // Auto-fill date from equipment entry if personnel entry doesn't have one
          if (!updated[index].date && equipmentEntry.date) {
            updated[index] = { ...updated[index], date: equipmentEntry.date };
          }
          
          // Auto-fill start time from equipment entry if personnel entry doesn't have one
          if (!updated[index].start1 && equipmentEntry.start) {
            updated[index] = { ...updated[index], start1: equipmentEntry.start };
          }
          
          // Auto-fill stop time from equipment entry if personnel entry doesn't have one
          if (!updated[index].stop1 && equipmentEntry.stop) {
            updated[index] = { ...updated[index], stop1: equipmentEntry.stop };
          }
          
          // Auto-calculate total if we now have both start and stop times
          if (updated[index].start1 && updated[index].stop1) {
            const total = autoCalculateTotal(updated[index].start1, updated[index].stop1);
            if (total) {
              updated[index] = { ...updated[index], total: total };
            }
          }
        }
      }
      
      saveFederalPersonnelEntry(updated[index]);
      return updated;
    });
    setHasUnsavedChanges(true);
  }, [equipmentEntries, setPersonnelEntries, setHasUnsavedChanges]);

  const handleTimeInput = useCallback((
    index: number, 
    field: 'start' | 'stop' | 'start1' | 'stop1' | 'start2' | 'stop2',
    value: string,
    type: 'equipment' | 'personnel'
  ) => {
    const fieldKey = `${type}-${index}-${field}`;
    
    // Remove any non-digit characters
    const cleanValue = value.replace(/[^\d]/g, '');
    
    // Only allow exactly 4 digits
    if (cleanValue.length > 4) {
      return; // Don't update if more than 4 digits
    }
    
    // Validate each character as it's typed using the simplified validation
    let isValid = true;
    let errorMessage = '';
    
    for (let i = 0; i < cleanValue.length; i++) {
      const char = cleanValue[i];
      const validation = validateTimeInput(cleanValue.slice(0, i), char);
      
      if (!validation.isValid) {
        isValid = false;
        errorMessage = validation.error || 'Invalid input';
        break;
      }
    }
    
    if (isValid && cleanValue.length === 4) {
      // Clear any existing error
      setTimeValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldKey];
        return newErrors;
      });
      
      // Format as HH:MM
      const formattedTime = `${cleanValue.slice(0, 2)}:${cleanValue.slice(2)}`;
      
      // Update the entry with formatted time
      if (type === 'equipment') {
        // Use the handler function directly
        setEquipmentEntries(prev => {
          const updated = handleFederalEquipmentEntryChange(prev, index, field as keyof FederalEquipmentEntry, formattedTime, DEFAULT_PROPAGATION_CONFIG);
          saveFederalEquipmentEntry(updated[index]);
          return updated;
        });
        setHasUnsavedChanges(true);
        
        // Auto-calculate total if both start and stop are provided
        if (field === 'stop1') {
          const entry = equipmentEntries[index];
          if (entry.start1 && formattedTime) {
            const total = autoCalculateTotal(entry.start1, formattedTime);
            if (total) {
              setEquipmentEntries(prev => {
                const updated = handleFederalEquipmentEntryChange(prev, index, 'total', total, DEFAULT_PROPAGATION_CONFIG);
                saveFederalEquipmentEntry(updated[index]);
                return updated;
              });
              setHasUnsavedChanges(true);
            }
          }
        } else if (field === 'stop2') {
          const entry = equipmentEntries[index];
          if (entry.start2 && formattedTime) {
            const total = autoCalculateTotal(entry.start2, formattedTime);
            if (total) {
              setEquipmentEntries(prev => {
                const updated = handleFederalEquipmentEntryChange(prev, index, 'total', total, DEFAULT_PROPAGATION_CONFIG);
                saveFederalEquipmentEntry(updated[index]);
                return updated;
              });
              setHasUnsavedChanges(true);
            }
          }
        }
      } else {
        // Use the handler function directly
        setPersonnelEntries(prev => {
          let updated = handleFederalPersonnelEntryChange(prev, index, field as keyof FederalPersonnelEntry, formattedTime, DEFAULT_PROPAGATION_CONFIG);
          saveFederalPersonnelEntry(updated[index]);
          return updated;
        });
        setHasUnsavedChanges(true);
        
        // Auto-calculate total for personnel entries
        if (field === 'stop1' || field === 'stop2') {
          const entry = personnelEntries[index];
          if (field === 'stop1' && entry.start1 && formattedTime) {
            const total1 = autoCalculateTotal(entry.start1, formattedTime);
            if (total1) {
              setPersonnelEntries(prev => {
                let updated = handleFederalPersonnelEntryChange(prev, index, 'total', total1, DEFAULT_PROPAGATION_CONFIG);
                saveFederalPersonnelEntry(updated[index]);
                return updated;
              });
              setHasUnsavedChanges(true);
            }
          } else if (field === 'stop2' && entry.start2 && formattedTime) {
            const total2 = autoCalculateTotal(entry.start2, formattedTime);
            if (total2) {
              // Calculate combined total if both periods are filled
              const total1 = entry.start1 && entry.stop1 ? autoCalculateTotal(entry.start1, entry.stop1) : '';
              const combinedTotal = total1 && total2 ? 
                autoCalculateTotal('00:00', autoCalculateTotal(total1, total2)) : total2;
              if (combinedTotal) {
                setPersonnelEntries(prev => {
                  let updated = handleFederalPersonnelEntryChange(prev, index, 'total', combinedTotal, DEFAULT_PROPAGATION_CONFIG);
                  saveFederalPersonnelEntry(updated[index]);
                  return updated;
                });
                setHasUnsavedChanges(true);
              }
            }
          }
        }
      }
    } else if (!isValid) {
      // Set validation error
      setTimeValidationErrors(prev => ({
        ...prev,
        [fieldKey]: errorMessage
      }));
    }
    
    // Always update the input value (even if invalid) so user can see what they're typing
    if (type === 'equipment') {
      setEquipmentEntries(prev => {
        const updated = handleFederalEquipmentEntryChange(prev, index, field as keyof FederalEquipmentEntry, cleanValue, DEFAULT_PROPAGATION_CONFIG);
        saveFederalEquipmentEntry(updated[index]);
        return updated;
      });
      setHasUnsavedChanges(true);
    } else {
      setPersonnelEntries(prev => {
        let updated = handleFederalPersonnelEntryChange(prev, index, field as keyof FederalPersonnelEntry, cleanValue, DEFAULT_PROPAGATION_CONFIG);
        saveFederalPersonnelEntry(updated[index]);
        return updated;
      });
      setHasUnsavedChanges(true);
    }
  }, [equipmentEntries, personnelEntries, setEquipmentEntries, setPersonnelEntries, setTimeValidationErrors, setHasUnsavedChanges]);

  const handleClearEquipmentEntry = useCallback((index: number) => {
    setEquipmentEntries(prev => {
      const updated = [...prev];
      updated[index] = { date: '', start: '', stop: '', start1: '', stop1: '', start2: '', stop2: '', total: '', quantity: '', type: '', remarks: '' };
      saveFederalEquipmentEntry(updated[index]);
      return updated;
    });
  }, [setEquipmentEntries]);

  const handleClearPersonnelEntry = useCallback((index: number) => {
    setPersonnelEntries(prev => {
      const updated = [...prev];
      updated[index] = { date: '', name: '', start1: '', stop1: '', start2: '', stop2: '', total: '', remarks: '' };
      saveFederalPersonnelEntry(updated[index]);
      return updated;
    });
  }, [setPersonnelEntries]);

  return {
    handleEquipmentEntryChange,
    handlePersonnelEntryChange,
    handleTimeInput,
    handleClearEquipmentEntry,
    handleClearPersonnelEntry
  };
};

