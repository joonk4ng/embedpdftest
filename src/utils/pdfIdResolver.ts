/**
 * Centralized PDF ID resolution from dates
 * 
 * This module provides a single source of truth for deriving PDF IDs from dates,
 * ensuring consistent date-to-ID conversion across the application.
 */

export type FormType = 'federal' | 'eest';

/**
 * Normalizes a date string to MM/DD/YY format
 * Handles various input formats and ensures consistent output
 */
export function normalizeDate(date: string | Date): string {
  if (date instanceof Date) {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    return `${month}/${day}/${year}`;
  }
  
  // If already in MM/DD/YY format, return as-is
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(date)) {
    return date;
  }
  
  // Try to parse other formats
  const parsed = new Date(date);
  if (!isNaN(parsed.getTime())) {
    return normalizeDate(parsed);
  }
  
  // Fallback: return as-is and let caller handle
  return date;
}

/**
 * Converts a date string (MM/DD/YY) to ID-safe format (MM-DD-YY)
 */
export function dateToIdFormat(date: string): string {
  const normalized = normalizeDate(date);
  return normalized.replace(/\//g, '-');
}

/**
 * Derives a PDF ID from a date and form type
 * 
 * @param date - Date in MM/DD/YY format (will be normalized)
 * @param formType - Type of form ('federal' or 'eest')
 * @returns PDF ID like 'federal-form-12-25-24'
 */
export function derivePdfIdFromDate(date: string | Date, formType: FormType = 'federal'): string {
  const normalizedDate = normalizeDate(date);
  const idFormat = dateToIdFormat(normalizedDate);
  const pdfId = `${formType}-form-${idFormat}`;
  console.log('🔍 derivePdfIdFromDate: Input:', date, '→ Normalized:', normalizedDate, '→ ID Format:', idFormat, '→ PDF ID:', pdfId);
  return pdfId;
}

/**
 * Resolves the PDF ID to load based on date or provided ID
 * 
 * This is the main entry point for PDF loading - it handles both:
 * - Date-based resolution (automatic ID derivation)
 * - Direct ID loading (for backward compatibility)
 * 
 * @param options - Resolution options
 * @returns The PDF ID to use for loading
 */
export function resolvePdfId(options: {
  date?: string | Date;
  pdfId?: string;
  formType?: FormType;
}): string {
  // If explicit PDF ID is provided, use it (backward compatibility)
  if (options.pdfId) {
    return options.pdfId;
  }
  
  // If date is provided, derive ID from it
  if (options.date) {
    return derivePdfIdFromDate(options.date, options.formType || 'federal');
  }
  
  // Fallback: use today's date
  return derivePdfIdFromDate(new Date(), options.formType || 'federal');
}

/**
 * Gets PDF ID for a signed PDF (used when saving)
 * 
 * @param date - Date in MM/DD/YY format
 * @returns PDF ID like 'federal-signed-12-25-24'
 */
export function getSignedPdfId(date: string | Date): string {
  const normalizedDate = normalizeDate(date);
  const idFormat = dateToIdFormat(normalizedDate);
  return `federal-signed-${idFormat}`;
}

