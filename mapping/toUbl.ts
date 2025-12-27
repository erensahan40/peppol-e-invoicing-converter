import { InvoiceNormalized } from '@/types/invoice';
import { UBLInvoice } from '@/types/ubl';
import { formatDateForUBL, roundTo2Decimals } from './normalize';

// Use require for xmlbuilder2 to avoid webpack bundling issues in Next.js
const { create } = require('xmlbuilder2');

/**
 * Convert normalized invoice to UBL XML (Peppol BIS Billing 3.0 compatible)
 */
export function convertToUBL(invoice: InvoiceNormalized): string {
  const currency = invoice.currency || 'EUR';

  // Ensure we always have at least empty arrays/objects for required fields
  const safeInvoice: InvoiceNormalized = {
    ...invoice,
    invoiceNumber: invoice.invoiceNumber || 'UNKNOWN',
    issueDate: invoice.issueDate || new Date(),
    currency: currency,
    lines: invoice.lines && invoice.lines.length > 0 ? invoice.lines : [],
    supplier: invoice.supplier || { name: '', address: { countryCode: 'BE' } },
    customer: invoice.customer || { name: '' },
  };

  // Build UBL structure - always generate, even with missing data
  const ublInvoice: any = {
    'cac:Invoice': {
      'cbc:CustomizationID':
        'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0',
      'cbc:ProfileID': 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
      'cbc:ID': safeInvoice.invoiceNumber,
      'cbc:IssueDate': formatDateForUBL(safeInvoice.issueDate!),
      'cbc:DocumentCurrencyCode': currency,
      'cbc:InvoiceTypeCode': {
        '@_listID': 'UN/ECE 1001',
        '#': '380', // Invoice
      },
      'cac:AccountingSupplierParty': {},
      'cac:AccountingCustomerParty': {},
      'cac:TaxTotal': [],
      'cac:LegalMonetaryTotal': {},
      'cac:InvoiceLine': [],
    },
  };

  // Add due date if available
  if (safeInvoice.dueDate) {
    ublInvoice['cac:Invoice']['cbc:DueDate'] = formatDateForUBL(safeInvoice.dueDate);
  }

  // Always add supplier party (with defaults if missing)
  ublInvoice['cac:Invoice']['cac:AccountingSupplierParty'] = {
    'cac:Party': buildParty(safeInvoice.supplier!),
  };

  // Always add customer party (with defaults if missing)
  ublInvoice['cac:Invoice']['cac:AccountingCustomerParty'] = {
    'cac:Party': buildParty(safeInvoice.customer!),
  };

  // Build invoice lines (empty array if none)
  const invoiceLines = safeInvoice.lines.map((line, index) => buildInvoiceLine(line, index + 1, currency));
  ublInvoice['cac:Invoice']['cac:InvoiceLine'] = invoiceLines;

  // Build tax totals (group by VAT rate) - always include at least one
  const taxTotals = buildTaxTotals(safeInvoice, currency);
  ublInvoice['cac:Invoice']['cac:TaxTotal'] = taxTotals.length > 0 ? taxTotals : [{
    'cbc:TaxAmount': {
      '@_currencyID': currency,
      '#': 0,
    },
  }];

  // Build legal monetary total - always include with defaults
  ublInvoice['cac:Invoice']['cac:LegalMonetaryTotal'] = buildLegalMonetaryTotal(safeInvoice, currency);

  // Convert to XML using xmlbuilder2 create function
  // Build the complete invoice object with namespaces
  const invoiceObj: any = {
    Invoice: {
      '@xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
      '@xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
      '@xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      ...ublInvoice['cac:Invoice'],
    },
  };

  // Create document from object
  const doc = create(invoiceObj);
  
  // Get the XML string with proper formatting
  const xml = doc.end({ prettyPrint: true });

  return xml;
}

function buildParty(party: InvoiceNormalized['supplier']): any {
  const ublParty: any = {};

  // Always include PartyName (even if empty)
  ublParty['cac:PartyName'] = {
    'cbc:Name': party?.name || '',
  };

  // Always include PostalAddress with at least country code
  ublParty['cac:PostalAddress'] = {
    'cac:Country': {
      'cbc:IdentificationCode': party?.address?.countryCode || 'BE',
    },
  };

  if (party?.address?.street) {
    ublParty['cac:PostalAddress']['cbc:StreetName'] = party.address.street;
  }
  if (party?.address?.city) {
    ublParty['cac:PostalAddress']['cbc:CityName'] = party.address.city;
  }
  if (party?.address?.postalCode) {
    ublParty['cac:PostalAddress']['cbc:PostalZone'] = party.address.postalCode;
  }

  if (party?.vatNumber) {
    ublParty['cac:PartyTaxScheme'] = {
      'cbc:CompanyID': party.vatNumber,
      'cac:TaxScheme': {
        'cbc:ID': 'VAT',
      },
    };
  }

  if (party?.name) {
    ublParty['cac:PartyLegalEntity'] = {
      'cbc:RegistrationName': party.name,
    };

    if (party.kboNumber) {
      ublParty['cac:PartyLegalEntity']['cac:CompanyID'] = {
        '@_schemeID': 'BE:CBE',
        '#': party.kboNumber,
      };
    }
  }

  return ublParty;
}

function buildInvoiceLine(line: InvoiceNormalized['lines'][0], lineNumber: number, currency: string): any {
  const quantity = line.quantity || 1;
  const unitPrice = line.unitPrice || 0;
  const lineTotal = line.lineTotal || roundTo2Decimals(quantity * unitPrice);
  const vatRate = line.vatRate || 0;
  const vatAmount = roundTo2Decimals((lineTotal * vatRate) / 100);

  const ublLine: any = {
    'cbc:ID': String(lineNumber),
    'cbc:InvoicedQuantity': {
      '@_unitCode': line.unitOfMeasure || 'C62',
      '#': quantity,
    },
    'cbc:LineExtensionAmount': {
      '@_currencyID': currency,
      '#': lineTotal,
    },
    'cac:Item': {
      'cbc:Description': line.description || 'Item',
    },
    'cac:Price': {
      'cbc:PriceAmount': {
        '@_currencyID': currency,
        '#': unitPrice,
      },
    },
    'cac:TaxTotal': {
      'cbc:TaxAmount': {
        '@_currencyID': currency,
        '#': vatAmount,
      },
      'cac:TaxSubtotal': {
        'cbc:TaxableAmount': {
          '@_currencyID': currency,
          '#': lineTotal,
        },
        'cbc:TaxAmount': {
          '@_currencyID': currency,
          '#': vatAmount,
        },
        'cac:TaxCategory': {
          'cbc:ID': line.vatCategory || 'S',
          'cbc:Percent': vatRate,
          'cac:TaxScheme': {
            'cbc:ID': 'VAT',
          },
        },
      },
    },
  };

  return ublLine;
}

function buildTaxTotals(invoice: InvoiceNormalized, currency: string): any[] {
  // Group lines by VAT rate
  const vatGroups = new Map<number, { taxable: number; tax: number }>();

  invoice.lines.forEach((line) => {
    if (line.vatRate !== undefined && line.lineTotal !== undefined) {
      const rate = line.vatRate;
      const taxable = line.lineTotal;
      const tax = roundTo2Decimals((taxable * rate) / 100);

      if (vatGroups.has(rate)) {
        const existing = vatGroups.get(rate)!;
        existing.taxable += taxable;
        existing.tax += tax;
      } else {
        vatGroups.set(rate, { taxable, tax });
      }
    }
  });

  // Build tax totals
  const taxTotals: any[] = [];

  vatGroups.forEach((values, rate) => {
    taxTotals.push({
      'cbc:TaxAmount': {
        '@_currencyID': currency,
        '#': roundTo2Decimals(values.tax),
      },
      'cac:TaxSubtotal': {
        'cbc:TaxableAmount': {
          '@_currencyID': currency,
          '#': roundTo2Decimals(values.taxable),
        },
        'cbc:TaxAmount': {
          '@_currencyID': currency,
          '#': roundTo2Decimals(values.tax),
        },
        'cac:TaxCategory': {
          'cbc:ID': 'S',
          'cbc:Percent': rate,
          'cac:TaxScheme': {
            'cbc:ID': 'VAT',
          },
        },
      },
    });
  });

  // If no VAT groups, create one with total
  if (taxTotals.length === 0 && invoice.vatTotal) {
    taxTotals.push({
      'cbc:TaxAmount': {
        '@_currencyID': currency,
        '#': invoice.vatTotal,
      },
      'cac:TaxSubtotal': {
        'cbc:TaxableAmount': {
          '@_currencyID': currency,
          '#': invoice.subtotalExclVat || 0,
        },
        'cbc:TaxAmount': {
          '@_currencyID': currency,
          '#': invoice.vatTotal,
        },
        'cac:TaxCategory': {
          'cbc:ID': 'S',
          'cbc:Percent': 0,
          'cac:TaxScheme': {
            'cbc:ID': 'VAT',
          },
        },
      },
    });
  }

  return taxTotals;
}

function buildLegalMonetaryTotal(invoice: InvoiceNormalized, currency: string): any {
  // Calculate from lines if totals are missing
  let subtotal = invoice.subtotalExclVat;
  let vatTotal = invoice.vatTotal;
  
  if (subtotal === undefined && invoice.lines.length > 0) {
    subtotal = invoice.lines.reduce((sum, line) => sum + (line.lineTotal || 0), 0);
  }
  
  if (vatTotal === undefined && invoice.lines.length > 0) {
    vatTotal = invoice.lines.reduce((sum, line) => {
      if (line.lineTotal && line.vatRate) {
        return sum + roundTo2Decimals((line.lineTotal * line.vatRate) / 100);
      }
      return sum;
    }, 0);
  }
  
  subtotal = subtotal || 0;
  vatTotal = vatTotal || 0;
  const total = invoice.totalInclVat || roundTo2Decimals(subtotal + vatTotal);

  return {
    'cbc:LineExtensionAmount': {
      '@_currencyID': currency,
      '#': roundTo2Decimals(subtotal),
    },
    'cbc:TaxExclusiveAmount': {
      '@_currencyID': currency,
      '#': roundTo2Decimals(subtotal),
    },
    'cbc:TaxInclusiveAmount': {
      '@_currencyID': currency,
      '#': roundTo2Decimals(total),
    },
    'cbc:PayableAmount': {
      '@_currencyID': currency,
      '#': roundTo2Decimals(total),
    },
  };
}

