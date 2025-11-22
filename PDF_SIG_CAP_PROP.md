# Time Calculation and Propagation System

This document describes the new time calculation and propagation system that automatically calculates total hours and propagates dates across equipment and personnel entries.

## Overview

The system consists of two main utility files:

1. **`src/utils/timeCalculations.ts`** - Core calculation functions
2. **`src/utils/entryPropagation.ts`** - Propagation and integration utilities

## Features

### 1. Automatic Time Calculations

- **Equipment Entries**: Calculates total hours from start/stop times
- **Personnel Entries**: Calculates total hours from two time periods (start1/stop1 + start2/stop2)
- **EEST Entries**: Calculates total hours from start/stop times
- **Overnight Shifts**: Handles shifts that cross midnight (e.g., 22:00 to 06:00)

### 2. Date Propagation

- **First Entry Propagation**: When you enter a date in the first entry, it automatically propagates to all other entries
- **Date Validation**: Validates and formats dates in MM/DD/YY format
- **Current Date Initialization**: Can initialize empty entries with the current date

### 3. PDF Integration

- **Automatic Field Population**: Calculated totals are automatically populated in PDF fields
- **Real-time Updates**: Changes to start/stop times immediately update totals in the PDF

## Usage

### Basic Time Calculation

```typescript
import { calculateTimeDifference } from '../utils/timeCalculations';

// Calculate hours between 8:00 AM and 5:00 PM
const result = calculateTimeDifference('0800', '1700');
console.log(result.totalHours); // 9
console.log(result.formattedTotal); // "9.00"
console.log(result.isValid); // true
```

### Date Propagation

```typescript
import { propagateDateToEntries } from '../utils/timeCalculations';

const entries = [
  { date: '12/15/24', start: '0800', stop: '1700', total: '', quantity: '1', type: 'Truck', remarks: 'Entry 1' },
  { date: '', start: '0800', stop: '1700', total: '', quantity: '1', type: 'Truck', remarks: 'Entry 2' },
  { date: '', start: '0800', stop: '1700', total: '', quantity: '1', type: 'Truck', remarks: 'Entry 3' }
];

// Propagate date from first entry to all others
const propagatedEntries = propagateDateToEntries(entries, 0);
// All entries now have date: '12/15/24'
```

### Component Integration

The system is already integrated into the React components:

#### Federal Time Table
- Equipment entries automatically calculate totals when start/stop times change
- Personnel entries calculate totals from both time periods
- Date propagation works when entering dates in the first entry

#### EEST Time Table
- Time entries automatically calculate work hours
- Date propagation works across all time entries

## Configuration

You can customize the propagation behavior using the `PropagationConfig`:

```typescript
import { PropagationConfig, DEFAULT_PROPAGATION_CONFIG } from '../utils/entryPropagation';

const customConfig: PropagationConfig = {
  autoCalculateTotals: true,    // Auto-calculate totals when times change
  autoPropagateDates: true,     // Auto-propagate dates
  propagateFromFirst: true,     // Propagate from first entry (vs. first valid date)
  validateDates: true           // Validate date formats
};
```

## Time Format Support

The system supports multiple time formats:

- **HH:MM** (e.g., "08:00", "17:30")
- **HHMM** (e.g., "0800", "1730")
- **HMM** (e.g., "800", "1730")
- **H** (e.g., "8" = 8:00 AM)

## Date Format Support

The system supports multiple date formats:

- **MM/DD/YY** (e.g., "12/15/24")
- **MM/DD/YYYY** (e.g., "12/15/2024")
- **MMDDYY** (e.g., "121524")
- **MMDDYYYY** (e.g., "12152024")

## Error Handling

The system provides comprehensive error handling:

```typescript
const result = calculateTimeDifference('0800', '1700');

if (!result.isValid) {
  console.error('Calculation error:', result.error);
} else {
  console.log('Total hours:', result.formattedTotal);
}
```

## Examples

### Equipment Entry with Overnight Shift

```typescript
const overnightEntry = {
  date: '12/15/24',
  start: '22:00',  // 10:00 PM
  stop: '06:00',   // 6:00 AM next day
  total: '',
  quantity: '1',
  type: 'Truck',
  remarks: 'Overnight shift'
};

const calculation = calculateFederalEquipmentTotal(overnightEntry);
console.log(calculation.formattedTotal); // "8.00" hours
```

### Personnel Entry with Two Time Periods

```typescript
const personnelEntry = {
  date: '12/15/24',
  name: 'John Doe',
  start1: '08:00',  // 8:00 AM
  stop1: '12:00',   // 12:00 PM (4 hours)
  start2: '13:00',  // 1:00 PM
  stop2: '17:00',   // 5:00 PM (4 hours)
  total: '',
  remarks: 'Split shift'
};

const calculation = calculateFederalPersonnelTotal(personnelEntry);
console.log(calculation.formattedTotal); // "8.00" hours total
```

## PDF Field Mapping

The calculated totals are automatically mapped to the appropriate PDF fields:

- **Federal Equipment**: `_18_TotalRow1`, `_18_TotalRow2`, etc.
- **Federal Personnel**: `_28_TotalRow1`, `_28_TotalRow2`, etc.
- **EEST Time**: `WORKRow1`, `WORKRow2`, etc.

## Troubleshooting

### Common Issues

1. **Times not calculating**: Ensure start and stop times are in a supported format
2. **Dates not propagating**: Check that the first entry has a valid date
3. **Invalid date errors**: Use MM/DD/YY format for dates

### Debug Information

The system logs detailed information to the browser console:

```typescript
// Enable debug logging
console.log('Equipment calculation:', calculation);
console.log('Date validation:', dateValidation);
console.log('Propagation status:', propagationStatus);
```

## Future Enhancements

Potential future improvements:

1. **Custom time formats**: Support for additional time formats
2. **Break time calculations**: Automatic break time deduction
3. **Overtime calculations**: Automatic overtime hour detection
4. **Export functionality**: Export calculated totals to CSV/Excel
5. **Validation rules**: Custom validation rules for different entry types

## API Reference

### Core Functions

- `calculateTimeDifference(startTime, stopTime)` - Calculate hours between two times
- `calculateFederalEquipmentTotal(entry)` - Calculate equipment entry total
- `calculateFederalPersonnelTotal(entry)` - Calculate personnel entry total
- `calculateEESTTimeTotal(entry)` - Calculate EEST time entry total
- `validateAndFormatDate(dateStr)` - Validate and format date string
- `propagateDateToEntries(entries, sourceIndex)` - Propagate date to entries

### Propagation Functions

- `handleFederalEquipmentEntryChange(entries, index, field, value, config)`
- `handleFederalPersonnelEntryChange(entries, index, field, value, config)`
- `handleEESTTimeEntryChange(entries, index, field, value, config)`
- `autoCalculateFederalEquipmentTotals(entries)`
- `autoCalculateFederalPersonnelTotals(entries)`
- `autoCalculateEESTTimeTotals(entries)`

This system provides a robust foundation for time tracking and calculation in the Engine Time Report application.
