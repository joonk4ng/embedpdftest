// Federal Time Table
import React, { useEffect, useCallback } from 'react';
import type { FederalFormData } from '../utils/engineTimeDB';
import {
  saveFederalEquipmentEntry,
  loadAllFederalEquipmentEntries,
  saveFederalPersonnelEntry,
  loadAllFederalPersonnelEntries,
  saveFederalFormData,
  loadFederalFormData,
  clearCorruptedData
} from '../utils/engineTimeDB';
import { getPDF, storePDFWithId, listPDFs } from '../utils/pdfStorage';
import { DateCalendar } from './DateCalendar';
import { CalendarPicker } from './CalendarPicker';
import { FederalFormFields } from './FederalForm/FederalFormFields';
import { EquipmentEntryRow } from './FederalForm/EquipmentEntryRow';
import { PersonnelEntryRow } from './FederalForm/PersonnelEntryRow';
import '../styles/components/ResponsivePDFViewer.css';
import { debugOriginalPDF, debugPDFFields } from '../utils/debugPDF';
import { usePDFGeneration } from '../hooks/usePDFGeneration';
import { useDateManagement } from '../hooks/useDateManagement';
import { useEntryHandlers } from '../hooks/useEntryHandlers';
import { useFederalFormState } from '../hooks/useFederalFormState';
import { usePayloadManagement } from '../hooks/usePayloadManagement';

export const FederalTimeTable: React.FC = () => {
  // Form state management hook
  const {
    federalFormData,
    setFederalFormData,
    equipmentEntries,
    setEquipmentEntries,
    personnelEntries,
    setPersonnelEntries,
    calendarOpen,
    setCalendarOpen,
    showMainCalendar,
    setShowMainCalendar,
    currentSelectedDate,
    setCurrentSelectedDate,
    savedDates,
    setSavedDates,
    timeValidationErrors,
    setTimeValidationErrors,
    checkboxStates,
    setCheckboxStates,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    isSaving,
    setIsSaving,
    lastSaved,
    setLastSaved,
    storedPDFs,
    setStoredPDFs,
    showPDFPreview,
    setShowPDFPreview,
    previewPDF,
    setPreviewPDF
  } = useFederalFormState();

  // Utility function to convert YYYY-MM-DD to MM/DD/YY format
  const convertYYYYMMDDToMMDDYY = (dateStr: string): string => {
    if (dateStr.includes('-') && dateStr.length === 10) {
      const [year, month, day] = dateStr.split('-');
      const shortYear = year.slice(-2);
      return `${month}/${day}/${shortYear}`;
    }
    return dateStr; // Already in MM/DD/YY format
  };

  // Utility function to generate remarks text from checkbox states
  const generateRemarksFromCheckboxes = (states: typeof checkboxStates): string[] => {
    const remarks = [];
    if (states.noMealsLodging) remarks.push('No Meals/Lodging');
    if (states.noMeals) remarks.push('No Meals');
    if (states.travel) remarks.push('Travel');
    if (states.noLunch) remarks.push('No Lunch');
    if (states.hotline) remarks.push('Hotline');
    return remarks;
  };


  // Migration function to convert old date formats to new format
  const migrateDateFormats = async () => {
    try {
      // Load all entries
      const allEquipmentEntries = await loadAllFederalEquipmentEntries();
      const allPersonnelEntries = await loadAllFederalPersonnelEntries();
      
      let hasChanges = false;
      
      // Check and convert equipment entries
      for (const entry of allEquipmentEntries) {
        if (entry.date && entry.date.includes('-') && entry.date.length === 10) {
          const newDate = convertYYYYMMDDToMMDDYY(entry.date);
          if (newDate !== entry.date) {
            await saveFederalEquipmentEntry({ ...entry, date: newDate });
            hasChanges = true;
          }
        }
      }
      
      // Check and convert personnel entries
      for (const entry of allPersonnelEntries) {
        if (entry.date && entry.date.includes('-') && entry.date.length === 10) {
          const newDate = convertYYYYMMDDToMMDDYY(entry.date);
          if (newDate !== entry.date) {
            await saveFederalPersonnelEntry({ ...entry, date: newDate });
            hasChanges = true;
          }
        }
      }
      
      if (hasChanges) {
        console.log('Migrated old date formats to MM/DD/YY format');
      }
    } catch (error) {
      console.error('Error migrating date formats:', error);
    }
  };

  // Load Federal data from IndexedDB on mount
  useEffect(() => {
    const initializeData = async () => {
      // First, clear any corrupted data from previous database issues
      await clearCorruptedData();
      
      // Then, migrate any old date formats
      await migrateDateFormats();
      
      // Load form data
      const saved = await loadFederalFormData();
      if (saved) {
        setFederalFormData(saved);
        
        // Initialize checkbox states from saved data or defaults
        if (saved.checkboxStates) {
          // Use saved checkbox states from IndexedDB
          setCheckboxStates(saved.checkboxStates);
          console.log('Loaded checkbox states from IndexedDB:', saved.checkboxStates);
        } else {
          // Fallback: Initialize checkbox states based on existing remarks (legacy support)
        if (saved.remarks) {
          const remarks = saved.remarks.split(', ');
            const legacyCheckboxStates = {
            noMealsLodging: remarks.includes('No Meals/Lodging'),
            noMeals: remarks.includes('No Meals'),
            travel: remarks.includes('Travel'),
            noLunch: remarks.includes('No Lunch'),
            hotline: remarks.includes('Hotline')
            };
            setCheckboxStates(legacyCheckboxStates);
            console.log('Loaded checkbox states from legacy remarks:', legacyCheckboxStates);
        } else {
            // If no saved data, use default state (Hotline = true)
            const defaultCheckboxStates = {
            noMealsLodging: false,
            noMeals: false,
            travel: false,
            noLunch: false,
            hotline: true  // Default to true
            };
            setCheckboxStates(defaultCheckboxStates);
            console.log('Using default checkbox states:', defaultCheckboxStates);
          }
        }
      }
      
      // Check for payload in URL parameters and apply after form data is loaded
      await parseAndApplyPayload();
      
      // Set today's date as default if no date is selected
      if (!currentSelectedDate) {
        const today = formatToMMDDYY(new Date());
        setCurrentSelectedDate(today);
        await loadDataForDate(today);
      }
      
      // Update saved dates list
      await refreshSavedDates();
    };
    
    initializeData();
  }, []);

  // Function to update selected date based on entry dates
  const updateSelectedDateFromEntries = useCallback(() => {
    // Only update the selected date if there's no current selected date
    // This prevents overriding the user's current date selection
    if (currentSelectedDate) {
      return; // Don't update if user has already selected a date
    }
    
    // Check equipment entries for dates
    const equipmentDates = equipmentEntries
      .filter(entry => entry.date && entry.date.trim() !== '')
      .map(entry => entry.date);
    
    // Check personnel entries for dates
    const personnelDates = personnelEntries
      .filter(entry => entry.date && entry.date.trim() !== '')
      .map(entry => entry.date);
    
    // Get all unique dates
    const allDates = [...new Set([...equipmentDates, ...personnelDates])];
    
    if (allDates.length > 0) {
      // If there's only one date, use it
      if (allDates.length === 1) {
        const singleDate = allDates[0];
        setCurrentSelectedDate(singleDate);
        console.log('Updated selected date to single entry date:', singleDate);
      } else {
        // If there are multiple dates, use the most recent one
        const sortedDates = allDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        const mostRecentDate = sortedDates[0];
        setCurrentSelectedDate(mostRecentDate);
        console.log('Updated selected date to most recent entry date:', mostRecentDate);
      }
    }
  }, [equipmentEntries, personnelEntries, currentSelectedDate]);

  // Watch for date changes in entries and update selected date
  useEffect(() => {
    updateSelectedDateFromEntries();
  }, [updateSelectedDateFromEntries]);

  // Function to handle manual date selection in entries
  const handleEntryDateSelect = useCallback((selectedDate: string) => {
    if (selectedDate && selectedDate !== currentSelectedDate) {
      setCurrentSelectedDate(selectedDate);
      console.log('Manually updated selected date from entry:', selectedDate);
    }
  }, [currentSelectedDate]);

  // Initialize federal PDF in storage
  useEffect(() => {
    const initializeFederalPDF = async () => {
      try {
        // Check if federal PDF already exists
        const existingPDF = await getPDF('federal-form');
        if (!existingPDF) {
          // Load the federal PDF from public folder
          const response = await fetch('/OF297-24.pdf');
          if (response.ok) {
            const pdfBlob = await response.blob();
            // Store with a fixed ID for the federal form
            await storePDFWithId('federal-form', pdfBlob, null, {
              filename: 'OF297-24.pdf',
              date: new Date().toISOString(),
              crewNumber: 'N/A',
              fireName: 'N/A',
              fireNumber: 'N/A'
            });
            console.log('Federal PDF initialized in storage');
          }
        }
      } catch (error) {
        console.error('Error initializing federal PDF:', error);
      }
    };

    initializeFederalPDF();
    
    // Load stored PDFs
    loadStoredPDFs();
  }, []);

  // Reload stored PDFs when the selected date changes
  useEffect(() => {
    if (currentSelectedDate) {
      loadStoredPDFs();
    }
  }, [currentSelectedDate]);

  // Reload stored PDFs when component becomes visible (e.g., returning from PDF signing)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && currentSelectedDate) {
        console.log('🔍 Component became visible, refreshing stored PDFs...');
        loadStoredPDFs();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Also refresh when window gains focus (alternative to visibility change)
    const handleFocus = () => {
      if (currentSelectedDate) {
        console.log('🔍 Window gained focus, refreshing stored PDFs...');
        loadStoredPDFs();
      }
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentSelectedDate]);

  // Handle Federal form data changes and autosave
  const handleFederalFormChange = (field: keyof FederalFormData, value: string) => {
    setFederalFormData(prev => {
      let updated = { ...prev, [field]: value };
      
      // Special handling for remarks field - only store manual remarks in UI
      if (field === 'remarks') {
        // For the UI, only store the manual text (what the user typed)
        // Checkbox remarks will be added separately for PDF generation
        updated.remarks = value;
        console.log('Form change - Manual remarks only:', updated.remarks);
      }
      
      saveFederalFormData(updated);
      return updated;
    });
    setHasUnsavedChanges(true);
  };

  // Handle checkbox changes for remarks section
  const handleCheckboxChange = async (option: keyof typeof checkboxStates) => {
    // Calculate new checkbox states
    const newStates = { ...checkboxStates };

      // If turning on travel, automatically uncheck hotline
      if (option === 'travel') {
      if (!checkboxStates.travel) {
          newStates.hotline = false;
        }
      newStates.travel = !checkboxStates.travel;
      } else if (option === 'hotline') {
        // If turning on hotline, automatically uncheck travel
      if (!checkboxStates.hotline) {
          newStates.travel = false;
        }
      newStates.hotline = !checkboxStates.hotline;
      } else {
        // For other checkboxes, toggle the state
      newStates[option] = !checkboxStates[option];
      }

    // Set the checkbox states in UI
    setCheckboxStates(newStates);

      // Don't update the form data remarks field - keep UI clean
      // Checkbox remarks will be added during PDF generation
      const selectedRemarks = generateRemarksFromCheckboxes(newStates);
      console.log('Checkbox change - Selected remarks (for PDF only):', selectedRemarks);

    // Save checkbox states to IndexedDB immediately
    try {
      setIsSaving(true);
      
      // Update form data with new checkbox states
      const updatedFormData = {
        ...federalFormData,
        checkboxStates: newStates
      };
      
      await saveFederalFormData(updatedFormData);
      setFederalFormData(updatedFormData);
      console.log('Checkbox states saved to IndexedDB:', newStates);

      // Get the full date range
      const fullDateRange = currentSelectedDate || formatToMMDDYY(new Date());

      // Save the record
      await saveDataForDate();

      // If the save is complete, set the has unsaved changes to false, set the last saved to the current time, and log the save completed
      setHasUnsavedChanges(false);
      setLastSaved(Date.now());
      console.log('Save completed:', { dateRange: fullDateRange });
    } catch (error) {
      // If there's an error, show a notification
      console.error('Save error:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Entry handlers hook
  const {
    handleEquipmentEntryChange,
    handlePersonnelEntryChange,
    handleTimeInput,
    handleClearEquipmentEntry,
    handleClearPersonnelEntry
  } = useEntryHandlers({
    equipmentEntries,
    personnelEntries,
    setEquipmentEntries,
    setPersonnelEntries,
    setTimeValidationErrors,
    setHasUnsavedChanges
  });

  // Calendar handlers
  const handleCalendarOpen = (type: 'equipment' | 'personnel', index: number) => {
    // Only allow calendar for equipment entries or first personnel entry
    if (type === 'equipment' || (type === 'personnel' && index === 0)) {
      setCalendarOpen({ type, index });
    }
  };

  const handleCalendarClose = () => {
    setCalendarOpen(null);
  };

  const handleDateSelect = (date: string) => {
    if (calendarOpen) {
      if (calendarOpen.type === 'equipment') {
        handleEquipmentEntryChange(calendarOpen.index, 'date', date);
      } else {
        handlePersonnelEntryChange(calendarOpen.index, 'date', date);
      }
      
      // Update the main selected date when a date is selected in an entry
      handleEntryDateSelect(date);
    }
  };

  // Get the current date from the calendar open
  const getCurrentDate = () => {
    if (!calendarOpen) return '';
    
    if (calendarOpen.type === 'equipment') {
      return equipmentEntries[calendarOpen.index]?.date || '';
    } else if (calendarOpen.type === 'personnel' && calendarOpen.index === 0) {
      // Only first personnel entry can have calendar
      return personnelEntries[calendarOpen.index]?.date || '';
    }
    return '';
  };

  // PDF generation hook
  const { generatePDF, isGenerating: isGeneratingPDF } = usePDFGeneration({
    formData: federalFormData,
    equipmentEntries,
    personnelEntries,
    checkboxStates,
    currentSelectedDate: currentSelectedDate || ''
  });

  // PDF handlers
  const handleViewPDF = generatePDF;


  // Load stored PDFs from IndexedDB (filtered by current date)
  const loadStoredPDFs = async () => {
    try {
      console.log('🔍 Loading stored PDFs...');
      const pdfs = await listPDFs();
      console.log('🔍 All PDFs from IndexedDB:', pdfs);
      
      // Filter for Federal PDFs only
      const federalPDFs = pdfs.filter(pdf => pdf.id.startsWith('federal-signed-'));
      console.log('🔍 Federal PDFs:', federalPDFs);
      
      // Get current selected date
      const currentDate = currentSelectedDate || formatToMMDDYY(new Date());
      console.log('🔍 Current selected date:', currentDate);
      
      // Filter PDFs by current date
      const dateFilteredPDFs = federalPDFs.filter(pdf => {
        console.log('🔍 Comparing PDF date:', pdf.metadata.date, 'with current date:', currentDate);
        // Check if the PDF's date matches the current selected date
        return pdf.metadata.date === currentDate;
      });
      
      console.log('🔍 Date filtered PDFs:', dateFilteredPDFs);
      setStoredPDFs(dateFilteredPDFs);
      console.log(`Loaded stored Federal PDFs for date ${currentDate}:`, dateFilteredPDFs.length);
    } catch (error) {
      console.error('Error loading stored PDFs:', error);
    }
  };

  // Handle PDF preview
  const handlePreviewPDF = async (pdfId: string) => {
    try {
      const pdfData = await getPDF(pdfId);
      if (pdfData) {
        setPreviewPDF(pdfData);
        setShowPDFPreview(true);
      } else {
        alert('PDF not found in storage.');
      }
    } catch (error) {
      console.error('Error loading PDF for preview:', error);
      alert('Error loading PDF for preview.');
    }
  };

  // Close PDF preview
  const handleClosePDFPreview = () => {
    setShowPDFPreview(false);
    setPreviewPDF(null);
  };

  // Payload management functions are now in usePayloadManagement hook


  // Main calendar handlers
  const handleMainCalendarOpen = () => {
    setShowMainCalendar(true);
  };

  const handleMainCalendarClose = () => {
    setShowMainCalendar(false);
  };

  const handleMainDateSelect = async (dateRange: string) => {
    // First, save the current data before switching dates
    if (currentSelectedDate && currentSelectedDate !== dateRange) {
      await saveDataForDate();
    }
    
    setCurrentSelectedDate(dateRange);
    setShowMainCalendar(false);
    // Load data for the selected date
    await loadDataForDate(dateRange);
  };

  // Date management hook
  const {
    handleNextDay,
    loadDataForDate,
    saveDataForDate,
    refreshSavedDates,
    formatToMMDDYY
  } = useDateManagement({
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
  });

  // Payload management hook
  const {
    parseAndApplyPayload,
    generateShareableLink
  } = usePayloadManagement({
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
  });

  return (
    <>
      <style>{`
        .preview-overlay {
          opacity: 0 !important;
        }
        div:hover .preview-overlay {
          opacity: 1 !important;
        }
      `}</style>

    <div style={{ 
      width: '100vw',
      maxWidth: '100vw',
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      padding: '16px',
      boxSizing: 'border-box',
      overflowX: 'hidden',
      position: 'relative',
      left: '50%',
      transform: 'translateX(-50%)'
    }}>
      {/* Main Container */}
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        
        {/* Header */}
        <div style={{
          backgroundColor: '#2c3e50',
          color: '#ffffff',
          padding: '20px',
          textAlign: 'center'
        }}>
          <h1 style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: '600',
            lineHeight: '1.2'
          }}>
            Federal - Emergency Equipment Shift Ticket
          </h1>
          <p style={{
            margin: '8px 0 0 0',
            fontSize: '14px',
            opacity: 0.9,
            lineHeight: '1.4'
          }}>
            OF-297 (Rev. 10/24) - Emergency Equipment Shift Ticket
          </p>
        </div>

        {/* Calendar Header */}
        <div style={{
          backgroundColor: '#f8f9fa',
          padding: '16px 20px',
          borderBottom: '1px solid #e9ecef',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <button
              onClick={handleMainCalendarOpen}
              style={{
                padding: '8px 16px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#0056b3'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#007bff'}
            >
              📅 Previous Tickets
            </button>
            
            <button
              onClick={handleNextDay}
              style={{
                padding: '8px 16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#218838'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#28a745'}
            >
              ➡️ Next Day
            </button>
            
            {currentSelectedDate && (
              <div style={{
                padding: '8px 12px',
                backgroundColor: '#e3f2fd',
                color: '#1976d2',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                border: '1px solid #bbdefb'
              }}>
                Selected: {currentSelectedDate}
              </div>
            )}
          </div>
          
        </div>

        {/* Form Content Container */}
        <div style={{
          padding: '20px',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          
          {/* Form Fields - Extracted to FederalFormFields component */}
          <FederalFormFields
            formData={federalFormData}
            onChange={handleFederalFormChange}
          />

          {/* Equipment Time Entries Section */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            marginBottom: '24px'
          }}>
            <h3 style={{
              margin: '0 0 16px 0',
              fontSize: '16px',
              fontWeight: '600',
              color: '#2c3e50',
              borderBottom: '2px solid #e9ecef',
              paddingBottom: '8px'
            }}>
              Equipment Time Entries
            </h3>
            
            {/* Equipment Table - Mobile Friendly */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {Array.from({ length: 1 }, (_, idx) => {
                const entry = equipmentEntries[idx] || { date: '', start: '', stop: '', start1: '', stop1: '', start2: '', stop2: '', total: '', quantity: '', type: '', remarks: '' };
                return (
                  <EquipmentEntryRow
                    key={idx}
                    entry={entry}
                    index={idx}
                    onChange={handleEquipmentEntryChange}
                    onTimeInput={handleTimeInput}
                    onClear={handleClearEquipmentEntry}
                    onCalendarOpen={handleCalendarOpen}
                    calendarOpen={calendarOpen}
                    onCalendarClose={handleCalendarClose}
                    onDateSelect={handleDateSelect}
                    validationErrors={timeValidationErrors}
                  />
                );
              })}
            </div>
          </div>

          {/* Personnel Time Entries Section */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            {Array.from({ length: 3 }, (_, idx) => {
              const entry = personnelEntries[idx] || { date: '', name: '', start1: '', stop1: '', start2: '', stop2: '', total: '', remarks: '' };
              return (
                <PersonnelEntryRow
                  key={idx}
                  entry={entry}
                  index={idx}
                  onChange={handlePersonnelEntryChange}
                  onTimeInput={handleTimeInput}
                  onClear={handleClearPersonnelEntry}
                  onCalendarOpen={handleCalendarOpen}
                  calendarOpen={calendarOpen}
                  onCalendarClose={handleCalendarClose}
                  onDateSelect={handleDateSelect}
                  validationErrors={timeValidationErrors}
                />
              );
            })}
          </div>
          
          {/* Remarks Section */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            marginTop: '16px',
            marginBottom: '24px'
          }}>
            <h3 style={{
              margin: '0 0 16px 0',
              fontSize: '16px',
              fontWeight: '600',
              color: '#2c3e50',
              borderBottom: '2px solid #e9ecef',
              paddingBottom: '8px'
            }}>
              Remarks & Status
            </h3>
            
            {/* Checkbox Options */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                border: '1px solid #e9ecef',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e9ecef'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}>
                <input
                  type="checkbox"
                  checked={checkboxStates.noMealsLodging}
                  onChange={() => handleCheckboxChange('noMealsLodging')}
                  style={{
                    width: '16px',
                    height: '16px',
                    cursor: 'pointer'
                  }}
                />
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#2c3e50'
                }}>
                  No Meals/Lodging
                </span>
              </label>

              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                border: '1px solid #e9ecef',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e9ecef'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}>
                <input
                  type="checkbox"
                  checked={checkboxStates.noMeals}
                  onChange={() => handleCheckboxChange('noMeals')}
                  style={{
                    width: '16px',
                    height: '16px',
                    cursor: 'pointer'
                  }}
                />
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#2c3e50'
                }}>
                  No Meals
                </span>
              </label>

              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                border: '1px solid #e9ecef',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e9ecef'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}>
                <input
                  type="checkbox"
                  checked={checkboxStates.travel}
                  onChange={() => handleCheckboxChange('travel')}
                  style={{
                    width: '16px',
                    height: '16px',
                    cursor: 'pointer'
                  }}
                />
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#2c3e50'
                }}>
                  Travel
                </span>
              </label>

              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                border: '1px solid #e9ecef',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e9ecef'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}>
                <input
                  type="checkbox"
                  checked={checkboxStates.noLunch}
                  onChange={() => handleCheckboxChange('noLunch')}
                  style={{
                    width: '16px',
                    height: '16px',
                    cursor: 'pointer'
                  }}
                />
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#2c3e50'
                }}>
                  No Lunch
                </span>
              </label>

              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                border: '1px solid #e9ecef',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e9ecef'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}>
                <input
                  type="checkbox"
                  checked={checkboxStates.hotline}
                  onChange={() => handleCheckboxChange('hotline')}
                  style={{
                    width: '16px',
                    height: '16px',
                    cursor: 'pointer'
                  }}
                />
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#2c3e50'
                }}>
                  Hotline
                </span>
              </label>
            </div>

            {/* General Remarks Textarea */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <label style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#2c3e50'
              }}>
                General Remarks
                {/* For testing purposes, disclaimer hidden */}
                <span style={{
                  fontSize: '12px',
                  fontWeight: '400',
                  color: '#666',
                  marginLeft: '8px',
                  display: 'none'
                }}>
                  (Manual text only - checkboxes appear on PDF)
                </span>
              </label>
              <textarea
                value={federalFormData.remarks}
                onChange={e => handleFederalFormChange('remarks', e.target.value)}
                style={{
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '16px',
                  backgroundColor: '#fff',
                  color: '#333',
                  minHeight: '100px',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
                placeholder="Enter any general remarks, equipment breakdown details, or other information as necessary..."
              />
            </div>
          </div>
        </div>

        {/* Action Buttons Container */}
        <div style={{
          padding: '20px',
          backgroundColor: '#f8f9fa',
          borderTop: '1px solid #e9ecef',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          {/* Status Indicator */}
          {(isSaving || hasUnsavedChanges) && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginBottom: '16px',
              padding: '8px 16px',
              backgroundColor: isSaving ? '#fff3cd' : '#d1ecf1',
              border: `1px solid ${isSaving ? '#ffeaa7' : '#bee5eb'}`,
              borderRadius: '6px',
              fontSize: '14px',
              color: isSaving ? '#856404' : '#0c5460'
            }}>
              {isSaving ? (
                <>
                  <span>💾</span>
                  <span>Saving changes...</span>
                </>
              ) : (
                <>
                  <span>⚠️</span>
                  <span>Unsaved changes</span>
                </>
              )}
            </div>
          )}
          
          {lastSaved && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginBottom: '16px',
              padding: '8px 16px',
              backgroundColor: '#d4edda',
              border: '1px solid #c3e6cb',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#155724'
            }}>
              <span>✅</span>
              <span>Last saved: {new Date(lastSaved).toLocaleTimeString()}</span>
            </div>
          )}

          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={handleViewPDF}
              disabled={isSaving || isGeneratingPDF}
              style={{
                padding: '12px 24px',
                backgroundColor: isSaving ? '#6c757d' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s ease',
                opacity: isSaving ? 0.6 : 1
              }}
              onMouseOver={(e) => {
                if (!isSaving) {
                  e.currentTarget.style.backgroundColor = '#218838';
                }
              }}
              onMouseOut={(e) => {
                if (!isSaving) {
                  e.currentTarget.style.backgroundColor = '#28a745';
                }
              }}
            >
              {isSaving ? '⏳ Saving...' : '✏️ Sign Ticket'}
            </button>
            
            <button
              onClick={generateShareableLink}
              style={{
                padding: '12px 24px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
                display: 'none'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#0056b3'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#007bff'}
            >
              🔗 Share Link
            </button>
            
             {/* Debug PDF Fields Button - temporarily visible for troubleshooting */}
             <button
               onClick={debugPDFFields}
               style={{
                 padding: '12px 24px',
                 backgroundColor: '#28a745',
                 color: 'white',
                 border: 'none',
                 borderRadius: '6px',
                 fontSize: '14px',
                 fontWeight: '600',
                 cursor: 'pointer',
                 transition: 'background-color 0.2s ease',
                 display: 'none'
               }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1e7e34'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#28a745'}
            >
              🔍 Debug PDF Fields
            </button>
            
            {/* Debug Original PDF Button, hidden for now */}
            <button
              onClick={debugOriginalPDF}
              style={{
                padding: '12px 24px',
                backgroundColor: '#ffc107',
                color: 'black',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
                display: 'none'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e0a800'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ffc107'}
            >
              🔍 Check Original PDF
            </button>
          </div>

          {/* Stored PDFs Section */}
          <div style={{
            marginTop: '24px',
            padding: '16px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #e9ecef'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: '600',
                color: '#2c3e50'
              }}>
                📄 Stored PDF for {currentSelectedDate || formatToMMDDYY(new Date())} ({storedPDFs.length > 0 ? '1' : '0'})
              </h3>
              <button
                onClick={loadStoredPDFs}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#0056b3'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#007bff'}
              >
                🔄 Refresh
              </button>
        </div>
            
            {storedPDFs.length > 0 ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '12px'
              }}>
                {storedPDFs.map((pdf) => (
                  <div 
                    key={pdf.id} 
                    onClick={() => handlePreviewPDF(pdf.id)}
                    style={{
                      padding: '12px',
                      backgroundColor: 'white',
                      borderRadius: '6px',
                      border: '1px solid #dee2e6',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = '#007bff';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 123, 255, 0.2)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = '#dee2e6';
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '8px'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: '600',
                          color: '#2c3e50',
                          marginBottom: '4px'
                        }}>
                          {pdf.metadata.filename}
                        </div>
                        <div style={{
                          fontSize: '12px',
                          color: '#6c757d',
                          marginBottom: '2px'
                        }}>
                          Date: {pdf.metadata.date}
                        </div>
                        <div style={{
                          fontSize: '12px',
                          color: '#6c757d'
                        }}>
                          Incident: {pdf.metadata.fireName}
                        </div>
                      </div>
                      {pdf.preview && (
                        <div style={{
                          width: '60px',
                          height: '40px',
                          backgroundColor: '#f8f9fa',
                          borderRadius: '4px',
                          border: '1px solid #dee2e6',
                          overflow: 'hidden',
                          marginLeft: '8px'
                        }}>
                          <img
                            src={URL.createObjectURL(pdf.preview)}
                            alt="PDF Preview"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover'
                            }}
                          />
                        </div>
                      )}
                    </div>
                    
                    {/* Click hint overlay */}
                    <div style={{
                      position: 'absolute',
                      top: '0',
                      left: '0',
                      right: '0',
                      bottom: '0',
                      backgroundColor: 'rgba(0, 123, 255, 0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: '0',
                      transition: 'opacity 0.2s ease',
                      pointerEvents: 'none',
                      borderRadius: '6px'
                    }}
                    className="preview-overlay"
                    >
                      <div style={{
                        backgroundColor: 'rgba(0, 123, 255, 0.9)',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '16px',
                        fontSize: '11px',
                        fontWeight: '600',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        👁️ Click to Preview
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '32px 16px',
                color: '#6c757d',
                fontSize: '14px'
              }}>
                <div style={{
                  fontSize: '48px',
                  marginBottom: '16px',
                  opacity: 0.5
                }}>
                  📄
                </div>
                <div style={{
                  fontWeight: '500',
                  marginBottom: '8px'
                }}>
                  No PDF stored for {currentSelectedDate || formatToMMDDYY(new Date())}
                </div>
                <div style={{
                  fontSize: '12px',
                  opacity: 0.8
                }}>
                  Sign and save a PDF to see it here (will replace any existing PDF for this date)
                </div>
              </div>
            )}
          </div>
        </div>
      </div>


      {/* Calendar Modal */}
       {calendarOpen && (
         <CalendarPicker
           isOpen={!!calendarOpen}
           onClose={handleCalendarClose}
           onSelectDate={handleDateSelect}
           currentDate={getCurrentDate()}
         />
       )}

       {/* Main Calendar Modal */}
       {showMainCalendar && (
         <DateCalendar
           savedDates={savedDates}
           onDateSelect={handleMainDateSelect}
           onClose={handleMainCalendarClose}
         />
       )}


      {/* PDF Preview Modal */}
      {showPDFPreview && previewPDF && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          paddingTop: '2.5vh',
          paddingRight: '2.5vw',
          zIndex: 2000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '20px 20px 20px 40px',
            width: '85vw',
            maxWidth: '85vw',
            maxHeight: '90vh',
            overflow: 'auto',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <button
              onClick={handleClosePDFPreview}
              style={{
                position: 'absolute',
                top: '10px',
                right: '15px',
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#666',
                zIndex: 2001
              }}
            >
              ×
            </button>
            <h3 style={{
              margin: '0 0 16px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: '#2c3e50'
            }}>
              PDF Preview: {previewPDF.metadata.filename}
            </h3>
            <div style={{
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              overflow: 'auto',
              flex: 1,
              minHeight: '60vh',
              maxHeight: '80vh'
            }}>
              <iframe
                src={URL.createObjectURL(previewPDF.pdf)}
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: '60vh',
                  border: 'none'
                }}
                title="PDF Preview"
              />
    </div>
            <div style={{
              marginTop: '16px',
              display: 'flex',
              gap: '12px',
              justifyContent: 'center'
            }}>
              <button
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(previewPDF.pdf);
                  link.download = previewPDF.metadata.filename;
                  link.click();
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                📥 Download PDF
              </button>
              <button
                onClick={handleClosePDFPreview}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                ✕ Close
              </button>
            </div>
           </div>
         </div>
       )}
    </div>
    </>
  );
};

export default FederalTimeTable; 