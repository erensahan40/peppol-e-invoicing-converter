import { InvoiceNormalized, ValidationError, MappingField } from '@/types/invoice';

/**
 * Data Quality Checker - Validates extracted data quality and confidence
 */
export function validateDataQuality(
  invoice: InvoiceNormalized,
  mappingFields: MappingField[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check confidence scores for critical fields
  const criticalFields = [
    { field: 'invoiceNumber', path: 'Invoice.ID', minConfidence: 0.5 },
    { field: 'issueDate', path: 'Invoice.IssueDate', minConfidence: 0.6 },
    { field: 'supplier.name', path: 'Invoice.AccountingSupplierParty.Party.PartyName.Name', minConfidence: 0.5 },
    { field: 'customer.name', path: 'Invoice.AccountingCustomerParty.Party.PartyName.Name', minConfidence: 0.5 },
  ];

  criticalFields.forEach(({ field, path, minConfidence }) => {
    const mapping = mappingFields.find((m) => m.field === field);
    if (mapping && mapping.confidence < minConfidence) {
      errors.push({
        code: 'WARN_LOW_CONFIDENCE',
        severity: 'warning',
        message: {
          nl: `Lage betrouwbaarheid voor ${getFieldName(field)} (${Math.round(mapping.confidence * 100)}%). Controleer de waarde: "${mapping.value}"`,
          en: `Low confidence for ${getFieldName(field)} (${Math.round(mapping.confidence * 100)}%). Verify the value: "${mapping.value}"`,
        },
        fieldPath: path,
        suggestedFix: `Controleer of "${mapping.rawValue || mapping.value}" correct is`,
      });
    }
  });

  // Validate invoice number format (should not be generic defaults)
  if (invoice.invoiceNumber) {
    const normalized = invoice.invoiceNumber.trim().toUpperCase();
    if (normalized === 'UNKNOWN' || normalized === 'N/A' || normalized === 'NULL' || normalized.length < 3) {
      errors.push({
        code: 'WARN_SUSPICIOUS_INVOICE_NUMBER',
        severity: 'warning',
        message: {
          nl: `Factuurnummer lijkt ongeldig of generiek: "${invoice.invoiceNumber}"`,
          en: `Invoice number seems invalid or generic: "${invoice.invoiceNumber}"`,
        },
        fieldPath: 'Invoice.ID',
        suggestedFix: 'Controleer of het factuurnummer correct is gelezen',
      });
    }
  }

  // Validate dates are reasonable (not too old, not too far in future)
  if (invoice.issueDate) {
    const issueDate = invoice.issueDate instanceof Date ? invoice.issueDate : new Date(invoice.issueDate);
    if (!isNaN(issueDate.getTime())) {
      const now = new Date();
      const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
      const oneYearFuture = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

      if (issueDate < fiveYearsAgo) {
        errors.push({
          code: 'WARN_VERY_OLD_DATE',
          severity: 'warning',
          message: {
            nl: `Factuurdatum is meer dan 5 jaar geleden: ${issueDate.toLocaleDateString('nl-NL')}`,
            en: `Invoice date is more than 5 years ago: ${issueDate.toLocaleDateString('en-US')}`,
          },
          fieldPath: 'Invoice.IssueDate',
          suggestedFix: 'Controleer of de datum correct is',
        });
      }

      if (issueDate > oneYearFuture) {
        errors.push({
          code: 'WARN_FAR_FUTURE_DATE',
          severity: 'warning',
          message: {
            nl: `Factuurdatum ligt meer dan 1 jaar in de toekomst: ${issueDate.toLocaleDateString('nl-NL')}`,
            en: `Invoice date is more than 1 year in the future: ${issueDate.toLocaleDateString('en-US')}`,
          },
          fieldPath: 'Invoice.IssueDate',
          suggestedFix: 'Controleer of de datum correct is',
        });
      }
    }
  }

  // Validate amounts are reasonable (not negative, not suspiciously large)
  if (invoice.lines && invoice.lines.length > 0) {
    invoice.lines.forEach((line, index) => {
      const linePath = `InvoiceLine[${index}]`;

      // Check for negative amounts
      if (line.quantity !== undefined && line.quantity < 0) {
        errors.push({
          code: 'ERR_NEGATIVE_QUANTITY',
          severity: 'error',
          message: {
            nl: `Regel ${index + 1}: Negatieve hoeveelheid gevonden: ${line.quantity}`,
            en: `Line ${index + 1}: Negative quantity found: ${line.quantity}`,
          },
          fieldPath: `${linePath}.InvoicedQuantity`,
          suggestedFix: 'Controleer de hoeveelheid - negatieve waarden zijn niet toegestaan',
        });
      }

      if (line.unitPrice !== undefined && line.unitPrice < 0) {
        errors.push({
          code: 'ERR_NEGATIVE_PRICE',
          severity: 'error',
          message: {
            nl: `Regel ${index + 1}: Negatieve prijs gevonden: ${line.unitPrice}`,
            en: `Line ${index + 1}: Negative price found: ${line.unitPrice}`,
          },
          fieldPath: `${linePath}.Price.PriceAmount`,
          suggestedFix: 'Controleer de prijs - negatieve waarden zijn niet toegestaan',
        });
      }

      if (line.lineTotal !== undefined && line.lineTotal < 0) {
        errors.push({
          code: 'ERR_NEGATIVE_LINE_TOTAL',
          severity: 'error',
          message: {
            nl: `Regel ${index + 1}: Negatief totaal gevonden: ${line.lineTotal}`,
            en: `Line ${index + 1}: Negative line total found: ${line.lineTotal}`,
          },
          fieldPath: `${linePath}.LineExtensionAmount`,
          suggestedFix: 'Controleer het totaal - negatieve waarden zijn niet toegestaan',
        });
      }

      // Check for suspiciously large amounts (likely parsing error)
      const maxReasonableAmount = 10000000; // 10 million
      if (line.lineTotal !== undefined && line.lineTotal > maxReasonableAmount) {
        errors.push({
          code: 'WARN_SUSPICIOUSLY_LARGE_AMOUNT',
          severity: 'warning',
          message: {
            nl: `Regel ${index + 1}: Zeer groot bedrag gevonden: ${line.lineTotal.toLocaleString('nl-NL')}. Dit kan een leesfout zijn.`,
            en: `Line ${index + 1}: Very large amount found: ${line.lineTotal.toLocaleString('en-US')}. This might be a parsing error.`,
          },
          fieldPath: `${linePath}.LineExtensionAmount`,
          suggestedFix: 'Controleer of het bedrag correct is gelezen',
        });
      }

      // Check for zero amounts (might be missing data)
      if (line.lineTotal === 0 && line.quantity !== undefined && line.quantity > 0 && line.unitPrice !== undefined && line.unitPrice > 0) {
        errors.push({
          code: 'WARN_ZERO_LINE_TOTAL',
          severity: 'warning',
          message: {
            nl: `Regel ${index + 1}: Totaal is 0 terwijl hoeveelheid en prijs > 0 zijn. Mogelijk ontbrekende data.`,
            en: `Line ${index + 1}: Total is 0 while quantity and price are > 0. Possible missing data.`,
          },
          fieldPath: `${linePath}.LineExtensionAmount`,
          suggestedFix: 'Controleer of alle gegevens correct zijn gelezen',
        });
      }

      // Check VAT rate is reasonable (0-100%)
      if (line.vatRate !== undefined) {
        if (line.vatRate < 0 || line.vatRate > 100) {
          errors.push({
            code: 'ERR_INVALID_VAT_RATE',
            severity: 'error',
            message: {
              nl: `Regel ${index + 1}: Ongeldig BTW percentage: ${line.vatRate}% (moet tussen 0 en 100 zijn)`,
              en: `Line ${index + 1}: Invalid VAT rate: ${line.vatRate}% (must be between 0 and 100)`,
            },
            fieldPath: `${linePath}.TaxCategory.Percent`,
            suggestedFix: 'Controleer het BTW percentage',
          });
        } else if (line.vatRate > 0 && line.vatRate < 1) {
          // Might be a decimal instead of percentage (e.g., 0.21 instead of 21)
          errors.push({
            code: 'WARN_VAT_RATE_FORMAT',
            severity: 'warning',
            message: {
              nl: `Regel ${index + 1}: BTW percentage lijkt in decimaal formaat: ${line.vatRate}. Verwacht percentage (bijv. 21 voor 21%)`,
              en: `Line ${index + 1}: VAT rate seems in decimal format: ${line.vatRate}. Expected percentage (e.g., 21 for 21%)`,
            },
            fieldPath: `${linePath}.TaxCategory.Percent`,
            suggestedFix: 'Controleer of het BTW percentage correct is (bijv. 21 voor 21%)',
          });
        }
      }
    });
  }

  // Validate totals are reasonable
  if (invoice.totalInclVat !== undefined) {
    if (invoice.totalInclVat < 0) {
      errors.push({
        code: 'ERR_NEGATIVE_TOTAL',
        severity: 'error',
        message: {
          nl: 'Totaal bedrag is negatief',
          en: 'Total amount is negative',
        },
        fieldPath: 'Invoice.LegalMonetaryTotal.TaxInclusiveAmount',
        suggestedFix: 'Controleer de totaalbedragen',
      });
    }

    const maxReasonableTotal = 100000000; // 100 million
    if (invoice.totalInclVat > maxReasonableTotal) {
      errors.push({
        code: 'WARN_SUSPICIOUSLY_LARGE_TOTAL',
        severity: 'warning',
        message: {
          nl: `Zeer groot totaal bedrag: ${invoice.totalInclVat.toLocaleString('nl-NL')}. Dit kan een leesfout zijn.`,
          en: `Very large total amount: ${invoice.totalInclVat.toLocaleString('en-US')}. This might be a parsing error.`,
        },
        fieldPath: 'Invoice.LegalMonetaryTotal.TaxInclusiveAmount',
        suggestedFix: 'Controleer of het totaal bedrag correct is gelezen',
      });
    }
  }

  // Validate supplier/customer names are not generic or suspicious
  if (invoice.supplier?.name) {
    const name = invoice.supplier.name.trim();
    const suspiciousNames = ['UNKNOWN', 'N/A', 'NULL', 'TBD', 'TO BE DETERMINED', 'EXAMPLE', 'TEST'];
    if (suspiciousNames.some((s) => name.toUpperCase().includes(s)) || name.length < 2) {
      errors.push({
        code: 'WARN_SUSPICIOUS_SUPPLIER_NAME',
        severity: 'warning',
        message: {
          nl: `Leveranciersnaam lijkt ongeldig of generiek: "${name}"`,
          en: `Supplier name seems invalid or generic: "${name}"`,
        },
        fieldPath: 'Invoice.AccountingSupplierParty.Party.PartyName.Name',
        suggestedFix: 'Controleer of de leveranciersnaam correct is gelezen',
      });
    }
  }

  if (invoice.customer?.name) {
    const name = invoice.customer.name.trim();
    const suspiciousNames = ['UNKNOWN', 'N/A', 'NULL', 'TBD', 'TO BE DETERMINED', 'EXAMPLE', 'TEST'];
    if (suspiciousNames.some((s) => name.toUpperCase().includes(s)) || name.length < 2) {
      errors.push({
        code: 'WARN_SUSPICIOUS_CUSTOMER_NAME',
        severity: 'warning',
        message: {
          nl: `Klantnaam lijkt ongeldig of generiek: "${name}"`,
          en: `Customer name seems invalid or generic: "${name}"`,
        },
        fieldPath: 'Invoice.AccountingCustomerParty.Party.PartyName.Name',
        suggestedFix: 'Controleer of de klantnaam correct is gelezen',
      });
    }
  }

  // Validate country codes are valid ISO 3166-1 alpha-2 codes
  if (invoice.supplier?.address?.countryCode) {
    const countryCode = invoice.supplier.address.countryCode.trim().toUpperCase();
    const validCountryCodes = [
      'BE', 'NL', 'DE', 'FR', 'GB', 'IT', 'ES', 'AT', 'DK', 'SE', 'NO', 'FI', 'PL', 'CZ', 'HU', 'RO', 'BG', 'HR', 'SI', 'SK', 'EE', 'LV', 'LT', 'IE', 'PT', 'GR', 'LU', 'MT', 'CY'
    ];
    if (!validCountryCodes.includes(countryCode)) {
      errors.push({
        code: 'WARN_INVALID_COUNTRY_CODE',
        severity: 'warning',
        message: {
          nl: `Ongeldige landcode voor leverancier: "${countryCode}". Gebruik een geldige ISO 3166-1 alpha-2 code (bijv. BE, NL, DE)`,
          en: `Invalid country code for supplier: "${countryCode}". Use a valid ISO 3166-1 alpha-2 code (e.g., BE, NL, DE)`,
        },
        fieldPath: 'Invoice.AccountingSupplierParty.Party.PostalAddress.Country.IdentificationCode',
        suggestedFix: 'Controleer de landcode (moet 2 letters zijn, bijv. BE, NL, DE)',
      });
    }
  }

  if (invoice.customer?.address?.countryCode) {
    const countryCode = invoice.customer.address.countryCode.trim().toUpperCase();
    const validCountryCodes = [
      'BE', 'NL', 'DE', 'FR', 'GB', 'IT', 'ES', 'AT', 'DK', 'SE', 'NO', 'FI', 'PL', 'CZ', 'HU', 'RO', 'BG', 'HR', 'SI', 'SK', 'EE', 'LV', 'LT', 'IE', 'PT', 'GR', 'LU', 'MT', 'CY'
    ];
    if (!validCountryCodes.includes(countryCode)) {
      errors.push({
        code: 'WARN_INVALID_COUNTRY_CODE',
        severity: 'warning',
        message: {
          nl: `Ongeldige landcode voor klant: "${countryCode}". Gebruik een geldige ISO 3166-1 alpha-2 code (bijv. BE, NL, DE)`,
          en: `Invalid country code for customer: "${countryCode}". Use a valid ISO 3166-1 alpha-2 code (e.g., BE, NL, DE)`,
        },
        fieldPath: 'Invoice.AccountingCustomerParty.Party.PostalAddress.Country.IdentificationCode',
        suggestedFix: 'Controleer de landcode (moet 2 letters zijn, bijv. BE, NL, DE)',
      });
    }
  }

  // Check if invoice has any lines with very low confidence
  if (invoice.lines && invoice.lines.length > 0) {
    const lowConfidenceLines = invoice.lines.filter((line) => line.confidence !== undefined && line.confidence < 0.4);
    if (lowConfidenceLines.length > 0) {
      errors.push({
        code: 'WARN_LOW_CONFIDENCE_LINES',
        severity: 'warning',
        message: {
          nl: `${lowConfidenceLines.length} factuurregel(s) hebben een lage betrouwbaarheid. Controleer of de gegevens correct zijn gelezen.`,
          en: `${lowConfidenceLines.length} invoice line(s) have low confidence. Verify if the data was read correctly.`,
        },
        fieldPath: 'Invoice.InvoiceLine',
        suggestedFix: 'Controleer de factuurregels met lage betrouwbaarheid',
      });
    }
  }

  return errors;
}

function getFieldName(field: string): string {
  const fieldNames: Record<string, string> = {
    invoiceNumber: 'factuurnummer',
    issueDate: 'factuurdatum',
    'supplier.name': 'leveranciersnaam',
    'customer.name': 'klantnaam',
  };
  return fieldNames[field] || field;
}

/**
 * Calculate overall data quality score (0-1)
 */
export function calculateDataQualityScore(
  invoice: InvoiceNormalized,
  mappingFields: MappingField[],
  validationErrors: ValidationError[]
): {
  score: number;
  level: 'excellent' | 'good' | 'fair' | 'poor';
  issues: string[];
} {
  let score = 1.0;
  const issues: string[] = [];

  // Deduct for low confidence scores
  const criticalFields = ['invoiceNumber', 'issueDate', 'supplier.name', 'customer.name'];
  criticalFields.forEach((field) => {
    const mapping = mappingFields.find((m) => m.field === field);
    if (mapping) {
      if (mapping.confidence < 0.5) {
        score -= 0.15;
        issues.push(`Lage betrouwbaarheid voor ${getFieldName(field)}`);
      } else if (mapping.confidence < 0.7) {
        score -= 0.05;
      }
    } else {
      score -= 0.1;
      issues.push(`Ontbrekend veld: ${getFieldName(field)}`);
    }
  });

  // Deduct for validation errors
  const errorCount = validationErrors.filter((e) => e.severity === 'error').length;
  const warningCount = validationErrors.filter((e) => e.severity === 'warning').length;
  score -= errorCount * 0.1;
  score -= warningCount * 0.02;

  // Deduct for suspicious values
  if (invoice.invoiceNumber && (invoice.invoiceNumber.toUpperCase() === 'UNKNOWN' || invoice.invoiceNumber.length < 3)) {
    score -= 0.1;
    issues.push('Verdacht factuurnummer');
  }

  // Ensure score is between 0 and 1
  score = Math.max(0, Math.min(1, score));

  let level: 'excellent' | 'good' | 'fair' | 'poor';
  if (score >= 0.9) {
    level = 'excellent';
  } else if (score >= 0.7) {
    level = 'good';
  } else if (score >= 0.5) {
    level = 'fair';
  } else {
    level = 'poor';
  }

  return { score, level, issues };
}

