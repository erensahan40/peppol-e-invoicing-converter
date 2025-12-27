// Core data models for invoice processing

export interface Address {
  street?: string;
  city?: string;
  postalCode?: string;
  countryCode?: string; // ISO 3166-1 alpha-2
  country?: string;
}

export interface Party {
  name?: string;
  address?: Address;
  vatNumber?: string; // BTW-nummer
  kboNumber?: string; // KBO nummer (België)
  taxRegistrationId?: string;
}

export interface InvoiceLine {
  description?: string;
  quantity?: number;
  unitPrice?: number; // excl. VAT
  unitOfMeasure?: string; // e.g., "C62" (piece), "MTR" (meter)
  vatRate?: number; // percentage (e.g., 21)
  vatCategory?: string; // e.g., "S" (Standard rate)
  lineTotal?: number; // excl. VAT
  confidence?: number; // 0-1
  source?: string; // where this was extracted from
}

export interface InvoiceNormalized {
  // Header
  invoiceNumber?: string;
  issueDate?: Date;
  dueDate?: Date;
  currency?: string; // ISO 4217, default "EUR"
  
  // Parties
  supplier?: Party;
  customer?: Party;
  
  // Payment
  paymentReference?: string;
  iban?: string;
  bic?: string;
  
  // Lines
  lines: InvoiceLine[];
  
  // Totals
  subtotalExclVat?: number;
  vatTotal?: number;
  totalInclVat?: number;
  
  // Metadata
  sourceType?: 'pdf' | 'xlsx';
  sourceFile?: string;
  extractionConfidence?: number; // overall confidence 0-1
}

export interface MappingField {
  field: string; // e.g., "invoiceNumber", "supplier.name"
  value: any;
  source: string; // e.g., "pdf-text", "xlsx-cell-A1", "regex-match"
  confidence: number; // 0-1
  rawValue?: string; // original extracted value before normalization
}

export interface DataQualityScore {
  score: number; // 0-1
  level: 'excellent' | 'good' | 'fair' | 'poor';
  issues: string[];
}

export interface MappingReport {
  fields: MappingField[];
  missingRequired: string[];
  warnings: string[];
  dataQuality?: DataQualityScore;
}

export interface ValidationError {
  code: string; // e.g., "ERR_MISSING_INVOICE_ID"
  severity: 'error' | 'warning';
  message: {
    nl: string;
    en: string;
  };
  fieldPath?: string; // e.g., "Invoice.ID" or "InvoiceLine[2].PriceAmount"
  suggestedFix?: string;
}

export interface ValidationReport {
  errors: ValidationError[];
  warnings: ValidationError[];
  isValid: boolean;
}

export interface ConversionResult {
  ublXml: string;
  validationReport: ValidationReport;
  mappingReport: MappingReport;
  normalizedInvoice: InvoiceNormalized;
  originalFile?: {
    data: string; // base64 encoded file
    mimeType: string;
    filename: string;
  };
}

