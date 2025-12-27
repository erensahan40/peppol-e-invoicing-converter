// @ts-ignore - pdf-parse types may not be available
import { InvoiceNormalized, InvoiceLine, MappingField } from '@/types/invoice';

export interface PDFParseResult {
  invoice: InvoiceNormalized;
  mappingFields: MappingField[];
}

/**
 * Extract invoice data from PDF text layer
 */
export async function parsePDF(buffer: Buffer, filename: string): Promise<PDFParseResult> {
  // Dynamic import to avoid issues with native modules in Next.js
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  const text = data.text;
  
  const mappingFields: MappingField[] = [];
  const invoice: InvoiceNormalized = {
    lines: [],
    sourceType: 'pdf',
    sourceFile: filename,
  };

  // Extract invoice number
  const invoiceNumber = extractInvoiceNumber(text);
  if (invoiceNumber) {
    invoice.invoiceNumber = invoiceNumber.value;
    mappingFields.push({
      field: 'invoiceNumber',
      value: invoiceNumber.value,
      source: 'pdf-text',
      confidence: invoiceNumber.confidence,
      rawValue: invoiceNumber.raw,
    });
  }

  // Extract dates
  const issueDate = extractDate(text, ['datum', 'date', 'factuurdatum', 'invoice date']);
  if (issueDate) {
    invoice.issueDate = issueDate.value;
    mappingFields.push({
      field: 'issueDate',
      value: issueDate.value,
      source: 'pdf-text',
      confidence: issueDate.confidence,
      rawValue: issueDate.raw,
    });
  }

  const dueDate = extractDate(text, ['vervaldatum', 'due date', 'payment date', 'betaaldatum']);
  if (dueDate) {
    invoice.dueDate = dueDate.value;
    mappingFields.push({
      field: 'dueDate',
      value: dueDate.value,
      source: 'pdf-text',
      confidence: dueDate.confidence,
      rawValue: dueDate.raw,
    });
  }

  // Extract currency (default EUR)
  const currency = extractCurrency(text) || 'EUR';
  invoice.currency = currency;
  mappingFields.push({
    field: 'currency',
    value: currency,
    source: 'pdf-text',
    confidence: currency !== 'EUR' ? 0.9 : 0.5,
  });

  // Extract supplier info
  const supplier = extractSupplier(text);
  if (supplier) {
    invoice.supplier = supplier.party;
    mappingFields.push(...supplier.mappings);
  }

  // Extract customer info
  const customer = extractCustomer(text);
  if (customer) {
    invoice.customer = customer.party;
    mappingFields.push(...customer.mappings);
  }

  // Extract payment info
  const iban = extractIBAN(text);
  if (iban) {
    invoice.iban = iban.value;
    mappingFields.push({
      field: 'iban',
      value: iban.value,
      source: 'pdf-text',
      confidence: iban.confidence,
      rawValue: iban.raw,
    });
  }

  // Extract invoice lines
  const lines = extractInvoiceLines(text);
  invoice.lines = lines.lines;
  mappingFields.push(...lines.mappings);

  // Extract totals
  const totals = extractTotals(text, currency);
  if (totals.subtotal) {
    invoice.subtotalExclVat = totals.subtotal.value;
    mappingFields.push({
      field: 'subtotalExclVat',
      value: totals.subtotal.value,
      source: 'pdf-text',
      confidence: totals.subtotal.confidence,
      rawValue: totals.subtotal.raw,
    });
  }
  if (totals.vatTotal) {
    invoice.vatTotal = totals.vatTotal.value;
    mappingFields.push({
      field: 'vatTotal',
      value: totals.vatTotal.value,
      source: 'pdf-text',
      confidence: totals.vatTotal.confidence,
      rawValue: totals.vatTotal.raw,
    });
  }
  if (totals.total) {
    invoice.totalInclVat = totals.total.value;
    mappingFields.push({
      field: 'totalInclVat',
      value: totals.total.value,
      source: 'pdf-text',
      confidence: totals.total.confidence,
      rawValue: totals.total.raw,
    });
  }

  return { invoice, mappingFields };
}

function extractInvoiceNumber(text: string): { value: string; confidence: number; raw: string } | null {
  const patterns = [
    /(?:factuur|invoice|nummer|no\.?|number)[\s:]*([A-Z0-9\-/]+)/i,
    /(?:nr|#)[\s:]*([A-Z0-9\-/]+)/i,
    /^([A-Z]{2,}\d{4,})/m, // e.g., "INV2024001"
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return {
        value: match[1].trim(),
        confidence: 0.8,
        raw: match[0],
      };
    }
  }

  return null;
}

function extractDate(
  text: string,
  keywords: string[]
): { value: Date; confidence: number; raw: string } | null {
  // Try to find date near keywords
  for (const keyword of keywords) {
    const regex = new RegExp(`${keyword}[\\s:]*([0-9]{1,2}[/\\-][0-9]{1,2}[/\\-][0-9]{2,4})`, 'i');
    const match = text.match(regex);
    if (match && match[1]) {
      const dateStr = match[1];
      const date = parseDate(dateStr);
      if (date) {
        return {
          value: date,
          confidence: 0.8,
          raw: match[0],
        };
      }
    }
  }

  // Fallback: find any date pattern
  const datePattern = /([0-9]{1,2}[/\-][0-9]{1,2}[/\-][0-9]{2,4})/;
  const match = text.match(datePattern);
  if (match) {
    const date = parseDate(match[1]);
    if (date) {
      return {
        value: date,
        confidence: 0.5,
        raw: match[1],
      };
    }
  }

  return null;
}

function parseDate(dateStr: string): Date | null {
  // Try DD/MM/YYYY, DD-MM-YYYY, MM/DD/YYYY
  const formats = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})/,
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      let day = parseInt(match[1], 10);
      let month = parseInt(match[2], 10);
      let year = parseInt(match[3], 10);

      if (year < 100) {
        year += 2000;
      }

      // Assume DD/MM if day > 12, otherwise try both
      if (day > 12 && month <= 12) {
        // DD/MM/YYYY
      } else if (month > 12 && day <= 12) {
        // MM/DD/YYYY
        [day, month] = [month, day];
      }

      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return new Date(year, month - 1, day);
      }
    }
  }

  return null;
}

function extractCurrency(text: string): string | null {
  const currencyMatch = text.match(/\b(EUR|USD|GBP|CHF)\b/i);
  return currencyMatch ? currencyMatch[1].toUpperCase() : null;
}

function extractSupplier(text: string): {
  party: InvoiceNormalized['supplier'];
  mappings: MappingField[];
} | null {
  const mappings: MappingField[] = [];
  const party: InvoiceNormalized['supplier'] = {};

  // Try to find supplier section (usually at top)
  const supplierKeywords = ['leverancier', 'supplier', 'verkoper', 'vendor', 'from'];
  let supplierText = text;

  for (const keyword of supplierKeywords) {
    const regex = new RegExp(`${keyword}[\\s\\n]+([^\\n]{20,200})`, 'i');
    const match = text.match(regex);
    if (match) {
      supplierText = match[1];
      break;
    }
  }

  // Extract name (first line or after keyword)
  const nameMatch = supplierText.match(/^([A-Z][^\n]{5,50})/m);
  if (nameMatch) {
    party.name = nameMatch[1].trim();
    mappings.push({
      field: 'supplier.name',
      value: party.name,
      source: 'pdf-text',
      confidence: 0.7,
      rawValue: nameMatch[0],
    });
  }

  // Extract VAT number
  const vatNumber = extractVATNumber(supplierText);
  if (vatNumber) {
    party.vatNumber = vatNumber.value;
    mappings.push({
      field: 'supplier.vatNumber',
      value: vatNumber.value,
      source: 'pdf-text',
      confidence: vatNumber.confidence,
      rawValue: vatNumber.raw,
    });
  }

  // Extract address
  const address = extractAddress(supplierText);
  if (address) {
    party.address = address.address;
    mappings.push(...address.mappings);
  }

  return party.name || party.vatNumber ? { party, mappings } : null;
}

function extractCustomer(text: string): {
  party: InvoiceNormalized['customer'];
  mappings: MappingField[];
} | null {
  const mappings: MappingField[] = [];
  const party: InvoiceNormalized['customer'] = {};

  const customerKeywords = ['klant', 'customer', 'client', 'aan', 'to', 'bill to'];
  let customerText = text;

  for (const keyword of customerKeywords) {
    const regex = new RegExp(`${keyword}[\\s\\n]+([^\\n]{20,200})`, 'i');
    const match = text.match(regex);
    if (match) {
      customerText = match[1];
      break;
    }
  }

  const nameMatch = customerText.match(/^([A-Z][^\n]{5,50})/m);
  if (nameMatch) {
    party.name = nameMatch[1].trim();
    mappings.push({
      field: 'customer.name',
      value: party.name,
      source: 'pdf-text',
      confidence: 0.7,
      rawValue: nameMatch[0],
    });
  }

  const vatNumber = extractVATNumber(customerText);
  if (vatNumber) {
    party.vatNumber = vatNumber.value;
    mappings.push({
      field: 'customer.vatNumber',
      value: vatNumber.value,
      source: 'pdf-text',
      confidence: vatNumber.confidence,
      rawValue: vatNumber.raw,
    });
  }

  const address = extractAddress(customerText);
  if (address) {
    party.address = address.address;
    mappings.push(...address.mappings);
  }

  return party.name ? { party, mappings } : null;
}

function extractVATNumber(text: string): { value: string; confidence: number; raw: string } | null {
  // BE: BE0123456789, NL: NL123456789B01, FR: FR12345678901
  const patterns = [
    /\b(BE\s?\d{10})\b/i,
    /\b(NL\s?\d{9}B\d{2})\b/i,
    /\b(FR\s?[A-HJ-NP-Z0-9]{2}\s?\d{9})\b/i,
    /\b(BTW|VAT|TVA)[\s:]*([A-Z]{2}[\s\-]?[A-Z0-9]+)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = match[1] || match[2];
      return {
        value: value.replace(/\s/g, ''),
        confidence: 0.9,
        raw: match[0],
      };
    }
  }

  return null;
}

function extractAddress(text: string): {
  address: NonNullable<InvoiceNormalized['supplier']>['address'];
  mappings: MappingField[];
} | null {
  const mappings: MappingField[] = [];
  const address: NonNullable<InvoiceNormalized['supplier']>['address'] = {};

  // Extract postal code + city
  const postalMatch = text.match(/\b(\d{4})\s+([A-Z][A-Za-z\s]+)\b/);
  if (postalMatch) {
    address.postalCode = postalMatch[1];
    address.city = postalMatch[2].trim();
    mappings.push({
      field: 'supplier.address.postalCode',
      value: address.postalCode,
      source: 'pdf-text',
      confidence: 0.8,
      rawValue: postalMatch[0],
    });
  }

  // Extract country code
  const countryMatch = text.match(/\b(BE|NL|FR|DE|LU)\b/);
  if (countryMatch) {
    address.countryCode = countryMatch[1];
    mappings.push({
      field: 'supplier.address.countryCode',
      value: address.countryCode,
      source: 'pdf-text',
      confidence: 0.7,
      rawValue: countryMatch[0],
    });
  }

  return address.postalCode || address.city ? { address, mappings } : null;
}

function extractIBAN(text: string): { value: string; confidence: number; raw: string } | null {
  // IBAN format: BE68 5390 0754 7034
  const ibanPattern = /\b([A-Z]{2}\d{2}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{0,2})\b/;
  const match = text.match(ibanPattern);
  if (match) {
    return {
      value: match[1].replace(/\s/g, ''),
      confidence: 0.9,
      raw: match[0],
    };
  }
  return null;
}

function extractInvoiceLines(text: string): {
  lines: InvoiceLine[];
  mappings: MappingField[];
} {
  const lines: InvoiceLine[] = [];
  const mappings: MappingField[] = [];

  // Try to find table-like structure with line items
  // Look for patterns like: description, qty, price, vat, total
  const linePattern = /([^\n]{10,50})\s+(\d+(?:[.,]\d+)?)\s+([\d.,]+)\s+(\d+(?:[.,]\d+)?%?)\s+([\d.,]+)/g;
  let match;
  let lineNum = 1;

  while ((match = linePattern.exec(text)) !== null && lineNum <= 20) {
    const description = match[1].trim();
    const qty = parseFloat(match[2].replace(',', '.'));
    const unitPrice = parseFloat(match[3].replace(',', '.'));
    const vatStr = match[4].replace('%', '');
    const vatRate = parseFloat(vatStr.replace(',', '.'));
    const lineTotal = parseFloat(match[5].replace(',', '.'));

    if (!isNaN(qty) && !isNaN(unitPrice) && !isNaN(lineTotal)) {
      const line: InvoiceLine = {
        description,
        quantity: qty,
        unitPrice,
        vatRate,
        lineTotal,
        confidence: 0.6,
        source: 'pdf-text',
      };

      lines.push(line);
      mappings.push({
        field: `lines[${lineNum - 1}].description`,
        value: description,
        source: 'pdf-text',
        confidence: 0.6,
      });
      lineNum++;
    }
  }

  return { lines, mappings };
}

function extractTotals(
  text: string,
  currency: string
): {
  subtotal?: { value: number; confidence: number; raw: string };
  vatTotal?: { value: number; confidence: number; raw: string };
  total?: { value: number; confidence: number; raw: string };
} {
  const result: ReturnType<typeof extractTotals> = {};

  // Extract subtotal
  const subtotalPattern = /(?:subtotaal|subtotal|excl\.?\s*vat|excl\.?\s*btw)[\s:]*([\d.,]+)/i;
  const subtotalMatch = text.match(subtotalPattern);
  if (subtotalMatch) {
    result.subtotal = {
      value: parseFloat(subtotalMatch[1].replace(',', '.')),
      confidence: 0.8,
      raw: subtotalMatch[0],
    };
  }

  // Extract VAT total
  const vatPattern = /(?:btw|vat|tva)[\s:]*([\d.,]+)/i;
  const vatMatch = text.match(vatPattern);
  if (vatMatch) {
    result.vatTotal = {
      value: parseFloat(vatMatch[1].replace(',', '.')),
      confidence: 0.8,
      raw: vatMatch[0],
    };
  }

  // Extract total
  const totalPattern = /(?:totaal|total|incl\.?\s*vat|incl\.?\s*btw|te\s*betalen)[\s:]*([\d.,]+)/i;
  const totalMatch = text.match(totalPattern);
  if (totalMatch) {
    result.total = {
      value: parseFloat(totalMatch[1].replace(',', '.')),
      confidence: 0.9,
      raw: totalMatch[0],
    };
  }

  return result;
}

