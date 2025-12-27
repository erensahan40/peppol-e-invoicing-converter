import { InvoiceNormalized, ValidationError } from '@/types/invoice';
import { roundTo2Decimals } from '@/mapping/normalize';

/**
 * Validate invoice against business rules (Peppol/BIS rules subset)
 */
export function validateBusinessRules(invoice: InvoiceNormalized): ValidationError[] {
  const errors: ValidationError[] = [];

  // WARN_MISSING_INVOICE_ID (changed to warning - will use default)
  if (!invoice.invoiceNumber || invoice.invoiceNumber.trim() === '') {
    errors.push({
      code: 'WARN_MISSING_INVOICE_ID',
      severity: 'warning',
      message: {
        nl: 'Factuurnummer ontbreekt (wordt "UNKNOWN" gebruikt)',
        en: 'Invoice ID is missing (will use "UNKNOWN")',
      },
      fieldPath: 'Invoice.ID',
      suggestedFix: 'Voeg een factuurnummer toe aan de factuur',
    });
  }

  // WARN_MISSING_ISSUE_DATE (changed to warning - will use today's date)
  if (!invoice.issueDate) {
    errors.push({
      code: 'WARN_MISSING_ISSUE_DATE',
      severity: 'warning',
      message: {
        nl: 'Factuurdatum ontbreekt (wordt huidige datum gebruikt)',
        en: 'Invoice issue date is missing (will use today\'s date)',
      },
      fieldPath: 'Invoice.IssueDate',
      suggestedFix: 'Voeg een factuurdatum toe',
    });
  } else {
    // ERR_INVALID_ISSUE_DATE
    const issueDate = invoice.issueDate instanceof Date ? invoice.issueDate : new Date(invoice.issueDate);
    if (isNaN(issueDate.getTime())) {
      errors.push({
        code: 'ERR_INVALID_ISSUE_DATE',
        severity: 'error',
        message: {
          nl: 'Factuurdatum is ongeldig',
          en: 'Invoice issue date is invalid',
        },
        fieldPath: 'Invoice.IssueDate',
        suggestedFix: 'Controleer de datumnotatie',
      });
    } else if (issueDate > new Date()) {
      errors.push({
        code: 'ERR_FUTURE_ISSUE_DATE',
        severity: 'warning',
        message: {
          nl: 'Factuurdatum ligt in de toekomst',
          en: 'Invoice issue date is in the future',
        },
        fieldPath: 'Invoice.IssueDate',
        suggestedFix: 'Controleer of de datum correct is',
      });
    }
  }

  // WARN_MISSING_SUPPLIER_NAME (changed to warning)
  if (!invoice.supplier?.name || invoice.supplier.name.trim() === '') {
    errors.push({
      code: 'WARN_MISSING_SUPPLIER_NAME',
      severity: 'warning',
      message: {
        nl: 'Leveranciersnaam ontbreekt',
        en: 'Supplier name is missing',
      },
      fieldPath: 'Invoice.AccountingSupplierParty.Party.PartyName.Name',
      suggestedFix: 'Voeg de naam van de leverancier toe',
    });
  }

  // WARN_MISSING_SUPPLIER_COUNTRY (changed to warning - will use default BE)
  if (!invoice.supplier?.address?.countryCode) {
    errors.push({
      code: 'WARN_MISSING_SUPPLIER_COUNTRY',
      severity: 'warning',
      message: {
        nl: 'Landcode leverancier ontbreekt (wordt "BE" gebruikt)',
        en: 'Supplier country code is missing (will use "BE")',
      },
      fieldPath: 'Invoice.AccountingSupplierParty.Party.PostalAddress.Country.IdentificationCode',
      suggestedFix: 'Voeg de landcode van de leverancier toe (bijv. BE, NL)',
    });
  }

  // WARN_MISSING_CUSTOMER_NAME (changed to warning)
  if (!invoice.customer?.name || invoice.customer.name.trim() === '') {
    errors.push({
      code: 'WARN_MISSING_CUSTOMER_NAME',
      severity: 'warning',
      message: {
        nl: 'Klantnaam ontbreekt',
        en: 'Customer name is missing',
      },
      fieldPath: 'Invoice.AccountingCustomerParty.Party.PartyName.Name',
      suggestedFix: 'Voeg de naam van de klant toe',
    });
  }

  // WARN_NO_INVOICE_LINES (changed to warning - will create empty array)
  if (!invoice.lines || invoice.lines.length === 0) {
    errors.push({
      code: 'WARN_NO_INVOICE_LINES',
      severity: 'warning',
      message: {
        nl: 'Geen factuurregels gevonden (lege factuur wordt gegenereerd)',
        en: 'No invoice lines found (empty invoice will be generated)',
      },
      fieldPath: 'Invoice.InvoiceLine',
      suggestedFix: 'Voeg minimaal één factuurregel toe',
    });
  }

  // Validate each line
  invoice.lines.forEach((line, index) => {
    const linePath = `InvoiceLine[${index}]`;

    // WARN_MISSING_LINE_DESCRIPTION
    if (!line.description || line.description.trim() === '') {
      errors.push({
        code: 'WARN_MISSING_LINE_DESCRIPTION',
        severity: 'warning',
        message: {
          nl: `Omschrijving ontbreekt voor regel ${index + 1}`,
          en: `Description missing for line ${index + 1}`,
        },
        fieldPath: `${linePath}.Item.Description`,
        suggestedFix: 'Voeg een omschrijving toe aan deze regel',
      });
    }

    // ERR_INVALID_LINE_AMOUNT
    if (line.quantity !== undefined && line.unitPrice !== undefined && line.lineTotal !== undefined) {
      const calculatedTotal = roundTo2Decimals((line.quantity || 0) * (line.unitPrice || 0));
      const actualTotal = roundTo2Decimals(line.lineTotal);
      const difference = Math.abs(calculatedTotal - actualTotal);

      if (difference > 0.01) {
        errors.push({
          code: 'ERR_INVALID_LINE_AMOUNT',
          severity: 'error',
          message: {
            nl: `Regel ${index + 1}: totaal komt niet overeen (${actualTotal} vs ${calculatedTotal})`,
            en: `Line ${index + 1}: total does not match (${actualTotal} vs ${calculatedTotal})`,
          },
          fieldPath: `${linePath}.LineExtensionAmount`,
          suggestedFix: `Controleer de berekening: ${line.quantity} × ${line.unitPrice} = ${calculatedTotal}`,
        });
      }
    }
  });

  // Validate totals
  if (invoice.lines.length > 0) {
    // Calculate expected subtotal
    const calculatedSubtotal = invoice.lines.reduce((sum, line) => {
      return sum + (line.lineTotal || 0);
    }, 0);

    if (invoice.subtotalExclVat !== undefined) {
      const difference = Math.abs(calculatedSubtotal - invoice.subtotalExclVat);
      if (difference > 0.01) {
        errors.push({
          code: 'ERR_INVALID_SUBTOTAL',
          severity: 'error',
          message: {
            nl: `Subtotaal komt niet overeen met som van regels (${invoice.subtotalExclVat} vs ${calculatedSubtotal})`,
            en: `Subtotal does not match sum of lines (${invoice.subtotalExclVat} vs ${calculatedSubtotal})`,
          },
          fieldPath: 'Invoice.LegalMonetaryTotal.TaxExclusiveAmount',
          suggestedFix: `Controleer de berekening: som van regels = ${calculatedSubtotal}`,
        });
      }
    }

    // Calculate expected VAT total
    const calculatedVatTotal = invoice.lines.reduce((sum, line) => {
      if (line.lineTotal && line.vatRate) {
        return sum + roundTo2Decimals((line.lineTotal * line.vatRate) / 100);
      }
      return sum;
    }, 0);

    if (invoice.vatTotal !== undefined && calculatedVatTotal > 0) {
      const difference = Math.abs(calculatedVatTotal - invoice.vatTotal);
      if (difference > 0.01) {
        errors.push({
          code: 'ERR_INVALID_VAT_TOTAL',
          severity: 'error',
          message: {
            nl: `BTW totaal komt niet overeen met som van regels (${invoice.vatTotal} vs ${calculatedVatTotal})`,
            en: `VAT total does not match sum of lines (${invoice.vatTotal} vs ${calculatedVatTotal})`,
          },
          fieldPath: 'Invoice.TaxTotal.TaxAmount',
          suggestedFix: `Controleer de BTW berekening per regel`,
        });
      }
    }

    // Validate total incl. VAT
    if (invoice.subtotalExclVat !== undefined && invoice.vatTotal !== undefined && invoice.totalInclVat !== undefined) {
      const calculatedTotal = roundTo2Decimals(invoice.subtotalExclVat + invoice.vatTotal);
      const actualTotal = roundTo2Decimals(invoice.totalInclVat);
      const difference = Math.abs(calculatedTotal - actualTotal);

      if (difference > 0.01) {
        errors.push({
          code: 'ERR_INVALID_TOTAL',
          severity: 'error',
          message: {
            nl: `Totaal incl. BTW komt niet overeen (${actualTotal} vs ${calculatedTotal})`,
            en: `Total incl. VAT does not match (${actualTotal} vs ${calculatedTotal})`,
          },
          fieldPath: 'Invoice.LegalMonetaryTotal.TaxInclusiveAmount',
          suggestedFix: `Controleer: ${invoice.subtotalExclVat} + ${invoice.vatTotal} = ${calculatedTotal}`,
        });
      }
    }
  }

  // Validate VAT numbers format
  if (invoice.supplier?.vatNumber) {
    const vatError = validateVATNumberFormat(invoice.supplier.vatNumber, 'supplier');
    if (vatError) {
      errors.push(vatError);
    }
  }

  if (invoice.customer?.vatNumber) {
    const vatError = validateVATNumberFormat(invoice.customer.vatNumber, 'customer');
    if (vatError) {
      errors.push(vatError);
    }
  }

  // Validate currency consistency
  if (invoice.currency && invoice.currency !== 'EUR') {
    errors.push({
      code: 'WARN_NON_EUR_CURRENCY',
      severity: 'warning',
      message: {
        nl: `Valuta is ${invoice.currency}, controleer of dit correct is`,
        en: `Currency is ${invoice.currency}, verify if this is correct`,
      },
      fieldPath: 'Invoice.DocumentCurrencyCode',
      suggestedFix: 'Controleer of de valuta overeenkomt met de factuur',
    });
  }

  return errors;
}

function validateVATNumberFormat(vatNumber: string, party: 'supplier' | 'customer'): ValidationError | null {
  const normalized = vatNumber.replace(/\s/g, '').toUpperCase();

  // BE: BE0123456789 (10 digits after BE)
  if (normalized.startsWith('BE')) {
    const digits = normalized.substring(2);
    if (!/^\d{10}$/.test(digits)) {
      return {
        code: 'ERR_INVALID_VAT_FORMAT',
        severity: 'error',
        message: {
          nl: `Ongeldig BTW-nummer formaat voor ${party === 'supplier' ? 'leverancier' : 'klant'} (BE verwacht 10 cijfers)`,
          en: `Invalid VAT number format for ${party} (BE expects 10 digits)`,
        },
        fieldPath: `Invoice.Accounting${party === 'supplier' ? 'Supplier' : 'Customer'}Party.Party.PartyTaxScheme.CompanyID`,
        suggestedFix: 'Controleer het BTW-nummer formaat (BE + 10 cijfers)',
      };
    }
  }

  // NL: NL123456789B01 (9 digits + B + 2 digits)
  if (normalized.startsWith('NL')) {
    const rest = normalized.substring(2);
    if (!/^\d{9}B\d{2}$/.test(rest)) {
      return {
        code: 'ERR_INVALID_VAT_FORMAT',
        severity: 'error',
        message: {
          nl: `Ongeldig BTW-nummer formaat voor ${party === 'supplier' ? 'leverancier' : 'klant'} (NL verwacht 9 cijfers + B + 2 cijfers)`,
          en: `Invalid VAT number format for ${party} (NL expects 9 digits + B + 2 digits)`,
        },
        fieldPath: `Invoice.Accounting${party === 'supplier' ? 'Supplier' : 'Customer'}Party.Party.PartyTaxScheme.CompanyID`,
        suggestedFix: 'Controleer het BTW-nummer formaat (NL + 9 cijfers + B + 2 cijfers)',
      };
    }
  }

  return null;
}

/**
 * Build validation report from errors
 */
export function buildValidationReport(errors: ValidationError[]): {
  errors: ValidationError[];
  warnings: ValidationError[];
  isValid: boolean;
} {
  const reportErrors = errors.filter((e) => e.severity === 'error');
  const warnings = errors.filter((e) => e.severity === 'warning');

  return {
    errors: reportErrors,
    warnings,
    isValid: reportErrors.length === 0,
  };
}

