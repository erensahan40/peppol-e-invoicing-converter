// @ts-ignore - xlsx types may not be available
import * as XLSX from 'xlsx';
import { InvoiceNormalized, InvoiceLine, MappingField } from '@/types/invoice';

export interface XLSXParseResult {
  invoice: InvoiceNormalized;
  mappingFields: MappingField[];
}

/**
 * Extract invoice data from XLSX file
 */
export async function parseXLSX(buffer: Buffer, filename: string): Promise<XLSXParseResult> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const mappingFields: MappingField[] = [];
  const invoice: InvoiceNormalized = {
    lines: [],
    sourceType: 'xlsx',
    sourceFile: filename,
  };

  // Try to find the main invoice sheet (usually first sheet or named "Invoice", "Factuur", etc.)
  let sheetName = workbook.SheetNames[0];
  for (const name of workbook.SheetNames) {
    if (/invoice|factuur/i.test(name)) {
      sheetName = name;
      break;
    }
  }

  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];

  // Find header row (look for keywords)
  let headerRowIndex = -1;
  const headerKeywords = ['factuur', 'invoice', 'nummer', 'number', 'datum', 'date', 'totaal', 'total'];

  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    const rowText = row.join(' ').toLowerCase();
    if (headerKeywords.some((keyword) => rowText.includes(keyword))) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    headerRowIndex = 0; // Assume first row is header
  }

  const headerRow = data[headerRowIndex];
  const headerMap = buildHeaderMap(headerRow);

  // Extract header fields
  extractHeaderFields(data, headerMap, headerRowIndex, invoice, mappingFields);

  // Extract invoice lines (rows after header)
  extractInvoiceLines(data, headerMap, headerRowIndex, invoice, mappingFields);

  // Extract totals (usually last few rows)
  extractTotals(data, headerMap, invoice, mappingFields);

  return { invoice, mappingFields };
}

interface HeaderMap {
  invoiceNumber?: number;
  issueDate?: number;
  dueDate?: number;
  currency?: number;
  supplierName?: number;
  supplierVat?: number;
  supplierAddress?: number;
  customerName?: number;
  customerVat?: number;
  description?: number;
  quantity?: number;
  unitPrice?: number;
  vatRate?: number;
  lineTotal?: number;
  subtotal?: number;
  vatTotal?: number;
  total?: number;
}

function buildHeaderMap(headerRow: any[]): HeaderMap {
  const map: HeaderMap = {};
  const synonyms: Record<keyof HeaderMap, string[]> = {
    invoiceNumber: ['factuurnummer', 'invoice no', 'invoice number', 'nummer', 'number', 'nr', 'factuur nr'],
    issueDate: ['datum', 'date', 'factuurdatum', 'invoice date', 'issue date'],
    dueDate: ['vervaldatum', 'due date', 'payment date', 'betaaldatum'],
    currency: ['valuta', 'currency', 'munt'],
    supplierName: ['leverancier', 'supplier', 'verkoper', 'vendor', 'from'],
    supplierVat: ['leverancier btw', 'supplier vat', 'supplier btw', 'btw leverancier'],
    supplierAddress: ['leverancier adres', 'supplier address', 'supplier adres', 'leverancier address'],
    customerName: ['klant', 'customer', 'client', 'aan', 'to'],
    customerVat: ['klant btw', 'customer vat', 'customer btw', 'btw klant'],
    description: ['omschrijving', 'description', 'product', 'item', 'artikel'],
    quantity: ['aantal', 'quantity', 'qty', 'hoeveelheid'],
    unitPrice: ['eenheidsprijs', 'unit price', 'prijs', 'price', 'prijs excl'],
    vatRate: ['btw', 'vat', 'btw%', 'vat%', 'btw percentage'],
    lineTotal: ['totaal lijn', 'line total', 'lijn totaal', 'totaal'],
    subtotal: ['subtotaal', 'subtotal', 'excl btw', 'excl vat'],
    vatTotal: ['btw totaal', 'vat total', 'totaal btw'],
    total: ['totaal incl', 'total incl', 'totaal', 'total', 'te betalen'],
  };

  for (let col = 0; col < headerRow.length; col++) {
    const cellValue = String(headerRow[col] || '').toLowerCase().trim();

    for (const key of Object.keys(synonyms) as Array<keyof HeaderMap>) {
      const synonymsList = synonyms[key];
      if (synonymsList.some((synonym) => cellValue.includes(synonym))) {
        map[key] = col;
        break;
      }
    }
  }

  return map;
}

function extractHeaderFields(
  data: any[][],
  headerMap: HeaderMap,
  headerRowIndex: number,
  invoice: InvoiceNormalized,
  mappingFields: MappingField[]
): void {
  // Look in first few rows for header info
  for (let row = 0; row < Math.min(headerRowIndex + 5, data.length); row++) {
    const rowData = data[row];

    if (headerMap.invoiceNumber !== undefined && rowData[headerMap.invoiceNumber]) {
      const value = String(rowData[headerMap.invoiceNumber]).trim();
      if (value && !invoice.invoiceNumber) {
        invoice.invoiceNumber = value;
        mappingFields.push({
          field: 'invoiceNumber',
          value,
          source: `xlsx-cell-${getCellAddress(row, headerMap.invoiceNumber)}`,
          confidence: 0.8,
          rawValue: value,
        });
      }
    }

    if (headerMap.issueDate !== undefined && rowData[headerMap.issueDate]) {
      const dateValue = parseDate(String(rowData[headerMap.issueDate]));
      if (dateValue && !invoice.issueDate) {
        invoice.issueDate = dateValue;
        mappingFields.push({
          field: 'issueDate',
          value: dateValue,
          source: `xlsx-cell-${getCellAddress(row, headerMap.issueDate)}`,
          confidence: 0.8,
          rawValue: String(rowData[headerMap.issueDate]),
        });
      }
    }

    if (headerMap.dueDate !== undefined && rowData[headerMap.dueDate]) {
      const dateValue = parseDate(String(rowData[headerMap.dueDate]));
      if (dateValue && !invoice.dueDate) {
        invoice.dueDate = dateValue;
        mappingFields.push({
          field: 'dueDate',
          value: dateValue,
          source: `xlsx-cell-${getCellAddress(row, headerMap.dueDate)}`,
          confidence: 0.8,
          rawValue: String(rowData[headerMap.dueDate]),
        });
      }
    }

    if (headerMap.currency !== undefined && rowData[headerMap.currency]) {
      const value = String(rowData[headerMap.currency]).trim().toUpperCase();
      if (value && !invoice.currency) {
        invoice.currency = value;
        mappingFields.push({
          field: 'currency',
          value,
          source: `xlsx-cell-${getCellAddress(row, headerMap.currency)}`,
          confidence: 0.9,
          rawValue: value,
        });
      }
    }

    if (headerMap.supplierName !== undefined && rowData[headerMap.supplierName]) {
      const value = String(rowData[headerMap.supplierName]).trim();
      if (value && !invoice.supplier) {
        invoice.supplier = { name: value };
        mappingFields.push({
          field: 'supplier.name',
          value,
          source: `xlsx-cell-${getCellAddress(row, headerMap.supplierName)}`,
          confidence: 0.8,
          rawValue: value,
        });
      }
    }

    if (headerMap.supplierVat !== undefined && rowData[headerMap.supplierVat]) {
      const value = String(rowData[headerMap.supplierVat]).trim();
      if (value && invoice.supplier) {
        invoice.supplier.vatNumber = value;
        mappingFields.push({
          field: 'supplier.vatNumber',
          value,
          source: `xlsx-cell-${getCellAddress(row, headerMap.supplierVat)}`,
          confidence: 0.8,
          rawValue: value,
        });
      }
    }

    if (headerMap.customerName !== undefined && rowData[headerMap.customerName]) {
      const value = String(rowData[headerMap.customerName]).trim();
      if (value && !invoice.customer) {
        invoice.customer = { name: value };
        mappingFields.push({
          field: 'customer.name',
          value,
          source: `xlsx-cell-${getCellAddress(row, headerMap.customerName)}`,
          confidence: 0.8,
          rawValue: value,
        });
      }
    }
  }

  if (!invoice.currency) {
    invoice.currency = 'EUR';
  }
}

function extractInvoiceLines(
  data: any[][],
  headerMap: HeaderMap,
  headerRowIndex: number,
  invoice: InvoiceNormalized,
  mappingFields: MappingField[]
): void {
  // Start from row after header
  for (let row = headerRowIndex + 1; row < data.length; row++) {
    const rowData = data[row];

    // Skip empty rows
    if (rowData.every((cell) => !cell || String(cell).trim() === '')) {
      continue;
    }

    // Check if this looks like a line item (has description or quantity)
    const hasDescription = headerMap.description !== undefined && rowData[headerMap.description];
    const hasQuantity = headerMap.quantity !== undefined && rowData[headerMap.quantity];

    if (hasDescription || hasQuantity) {
      const line: InvoiceLine = {
        confidence: 0.7,
        source: `xlsx-row-${row + 1}`,
      };

      if (headerMap.description !== undefined && rowData[headerMap.description]) {
        line.description = String(rowData[headerMap.description]).trim();
        mappingFields.push({
          field: `lines[${invoice.lines.length}].description`,
          value: line.description,
          source: `xlsx-cell-${getCellAddress(row, headerMap.description)}`,
          confidence: 0.7,
        });
      }

      if (headerMap.quantity !== undefined && rowData[headerMap.quantity]) {
        const qty = parseFloat(String(rowData[headerMap.quantity]).replace(',', '.'));
        if (!isNaN(qty)) {
          line.quantity = qty;
          mappingFields.push({
            field: `lines[${invoice.lines.length}].quantity`,
            value: qty,
            source: `xlsx-cell-${getCellAddress(row, headerMap.quantity)}`,
            confidence: 0.7,
          });
        }
      }

      if (headerMap.unitPrice !== undefined && rowData[headerMap.unitPrice]) {
        const price = parseFloat(String(rowData[headerMap.unitPrice]).replace(',', '.'));
        if (!isNaN(price)) {
          line.unitPrice = price;
          mappingFields.push({
            field: `lines[${invoice.lines.length}].unitPrice`,
            value: price,
            source: `xlsx-cell-${getCellAddress(row, headerMap.unitPrice)}`,
            confidence: 0.7,
          });
        }
      }

      if (headerMap.vatRate !== undefined && rowData[headerMap.vatRate]) {
        const vatStr = String(rowData[headerMap.vatRate]).replace('%', '').replace(',', '.');
        const vatRate = parseFloat(vatStr);
        if (!isNaN(vatRate)) {
          line.vatRate = vatRate;
          mappingFields.push({
            field: `lines[${invoice.lines.length}].vatRate`,
            value: vatRate,
            source: `xlsx-cell-${getCellAddress(row, headerMap.vatRate)}`,
            confidence: 0.7,
          });
        }
      }

      if (headerMap.lineTotal !== undefined && rowData[headerMap.lineTotal]) {
        const total = parseFloat(String(rowData[headerMap.lineTotal]).replace(',', '.'));
        if (!isNaN(total)) {
          line.lineTotal = total;
          mappingFields.push({
            field: `lines[${invoice.lines.length}].lineTotal`,
            value: total,
            source: `xlsx-cell-${getCellAddress(row, headerMap.lineTotal)}`,
            confidence: 0.7,
          });
        }
      }

      if (line.description || line.quantity) {
        invoice.lines.push(line);
      }
    }
  }
}

function extractTotals(
  data: any[][],
  headerMap: HeaderMap,
  invoice: InvoiceNormalized,
  mappingFields: MappingField[]
): void {
  // Look in last few rows for totals
  const startRow = Math.max(0, data.length - 5);
  for (let row = startRow; row < data.length; row++) {
    const rowData = data[row];
    const rowText = rowData.join(' ').toLowerCase();

    if (headerMap.subtotal !== undefined && rowData[headerMap.subtotal]) {
      const value = parseFloat(String(rowData[headerMap.subtotal]).replace(',', '.'));
      if (!isNaN(value) && !invoice.subtotalExclVat) {
        invoice.subtotalExclVat = value;
        mappingFields.push({
          field: 'subtotalExclVat',
          value,
          source: `xlsx-cell-${getCellAddress(row, headerMap.subtotal)}`,
          confidence: 0.8,
        });
      }
    }

    if (headerMap.vatTotal !== undefined && rowData[headerMap.vatTotal]) {
      const value = parseFloat(String(rowData[headerMap.vatTotal]).replace(',', '.'));
      if (!isNaN(value) && !invoice.vatTotal) {
        invoice.vatTotal = value;
        mappingFields.push({
          field: 'vatTotal',
          value,
          source: `xlsx-cell-${getCellAddress(row, headerMap.vatTotal)}`,
          confidence: 0.8,
        });
      }
    }

    if (headerMap.total !== undefined && rowData[headerMap.total]) {
      const value = parseFloat(String(rowData[headerMap.total]).replace(',', '.'));
      if (!isNaN(value) && !invoice.totalInclVat) {
        invoice.totalInclVat = value;
        mappingFields.push({
          field: 'totalInclVat',
          value,
          source: `xlsx-cell-${getCellAddress(row, headerMap.total)}`,
          confidence: 0.9,
        });
      }
    }
  }
}

function parseDate(dateStr: string): Date | null {
  // Try to parse Excel date number or date string
  const excelDateNum = parseFloat(dateStr);
  if (!isNaN(excelDateNum) && excelDateNum > 25569) {
    // Excel date (days since 1900-01-01)
    const date = new Date((excelDateNum - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Try string date formats
  const formats = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      let day, month, year;
      if (format === formats[0]) {
        day = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        year = parseInt(match[3], 10);
      } else {
        year = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        day = parseInt(match[3], 10);
      }

      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return new Date(year, month - 1, day);
      }
    }
  }

  return null;
}

function getCellAddress(row: number, col: number): string {
  const colLetter = String.fromCharCode(65 + (col % 26));
  const colNum = Math.floor(col / 26);
  const colStr = colNum > 0 ? String.fromCharCode(64 + colNum) + colLetter : colLetter;
  return `${colStr}${row + 1}`;
}

