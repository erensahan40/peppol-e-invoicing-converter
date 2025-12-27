import { InvoiceNormalized, InvoiceLine } from '@/types/invoice';

/**
 * Normalize invoice data: fix data types, calculate missing values, validate formats
 */
export function normalizeInvoice(invoice: InvoiceNormalized): InvoiceNormalized {
  const normalized = { ...invoice };

  // Normalize currency (default EUR)
  if (!normalized.currency) {
    normalized.currency = 'EUR';
  }
  normalized.currency = normalized.currency.toUpperCase();

  // Normalize dates
  if (normalized.issueDate && !(normalized.issueDate instanceof Date)) {
    normalized.issueDate = new Date(normalized.issueDate);
  }
  if (normalized.dueDate && !(normalized.dueDate instanceof Date)) {
    normalized.dueDate = new Date(normalized.dueDate);
  }

  // Normalize VAT numbers
  if (normalized.supplier?.vatNumber) {
    normalized.supplier.vatNumber = normalizeVATNumber(normalized.supplier.vatNumber);
  }
  if (normalized.customer?.vatNumber) {
    normalized.customer.vatNumber = normalizeVATNumber(normalized.customer.vatNumber);
  }

  // Normalize IBAN
  if (normalized.iban) {
    normalized.iban = normalizeIBAN(normalized.iban);
  }

  // Normalize lines and calculate missing values
  normalized.lines = normalized.lines.map((line, index) => normalizeLine(line, index));

  // Calculate totals if missing
  calculateTotals(normalized);

  return normalized;
}

function normalizeLine(line: InvoiceLine, index: number): InvoiceLine {
  const normalized = { ...line };

  // Ensure quantity defaults to 1
  if (normalized.quantity === undefined || normalized.quantity === null) {
    normalized.quantity = 1;
  }

  // Calculate line total if missing
  if (normalized.unitPrice !== undefined && normalized.quantity !== undefined) {
    if (normalized.lineTotal === undefined || normalized.lineTotal === null) {
      normalized.lineTotal = roundTo2Decimals(normalized.unitPrice * normalized.quantity);
    }
  }

  // Normalize VAT rate
  if (normalized.vatRate !== undefined) {
    normalized.vatRate = roundTo2Decimals(normalized.vatRate);
    // Default VAT category to "S" (Standard rate) if not set
    if (!normalized.vatCategory) {
      normalized.vatCategory = 'S';
    }
  }

  // Default unit of measure
  if (!normalized.unitOfMeasure) {
    normalized.unitOfMeasure = 'C62'; // Piece
  }

  return normalized;
}

function calculateTotals(invoice: InvoiceNormalized): void {
  // Calculate subtotal from lines
  if (invoice.lines.length > 0) {
    const calculatedSubtotal = invoice.lines.reduce((sum, line) => {
      return sum + (line.lineTotal || 0);
    }, 0);

    if (invoice.subtotalExclVat === undefined || invoice.subtotalExclVat === null) {
      invoice.subtotalExclVat = roundTo2Decimals(calculatedSubtotal);
    }
  }

  // Calculate VAT total from lines if missing
  if (invoice.lines.length > 0 && invoice.vatTotal === undefined) {
    const calculatedVatTotal = invoice.lines.reduce((sum, line) => {
      if (line.lineTotal && line.vatRate) {
        const vatAmount = (line.lineTotal * line.vatRate) / 100;
        return sum + vatAmount;
      }
      return sum;
    }, 0);

    invoice.vatTotal = roundTo2Decimals(calculatedVatTotal);
  }

  // Calculate total incl. VAT
  if (invoice.subtotalExclVat !== undefined && invoice.vatTotal !== undefined) {
    if (invoice.totalInclVat === undefined || invoice.totalInclVat === null) {
      invoice.totalInclVat = roundTo2Decimals(invoice.subtotalExclVat + invoice.vatTotal);
    }
  }
}

function normalizeVATNumber(vat: string): string {
  // Remove spaces and convert to uppercase
  let normalized = vat.replace(/\s/g, '').toUpperCase();

  // Ensure country code prefix
  if (!/^[A-Z]{2}/.test(normalized)) {
    // Try to infer from format
    if (/^\d{10}$/.test(normalized)) {
      normalized = 'BE' + normalized; // Belgian format
    } else if (/^\d{9}B\d{2}$/.test(normalized)) {
      normalized = 'NL' + normalized; // Dutch format
    }
  }

  return normalized;
}

function normalizeIBAN(iban: string): string {
  // Remove spaces and convert to uppercase
  return iban.replace(/\s/g, '').toUpperCase();
}

export function roundTo2Decimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Format date as YYYY-MM-DD for UBL
 */
export function formatDateForUBL(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

