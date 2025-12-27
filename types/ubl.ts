// UBL Invoice types (Peppol BIS Billing 3.0 compatible)

export interface UBLInvoice {
  'cac:Invoice': {
    'cbc:CustomizationID': string; // "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0"
    'cbc:ProfileID': string; // "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"
    'cbc:ID': string; // Invoice number
    'cbc:IssueDate': string; // YYYY-MM-DD
    'cbc:DueDate'?: string; // YYYY-MM-DD
    'cbc:InvoiceTypeCode': {
      '@_listID': string;
      '#': string; // "380" for invoice
    };
    'cbc:DocumentCurrencyCode': string; // ISO 4217
    'cac:AccountingSupplierParty': {
      'cac:Party': UBLParty;
    };
    'cac:AccountingCustomerParty': {
      'cac:Party': UBLParty;
    };
    'cac:TaxTotal': UBLTaxTotal[];
    'cac:LegalMonetaryTotal': UBLLegalMonetaryTotal;
    'cac:InvoiceLine': UBLInvoiceLine[];
  };
}

export interface UBLParty {
  'cac:PartyName'?: {
    'cbc:Name': string;
  };
  'cac:PostalAddress': {
    'cbc:StreetName'?: string;
    'cbc:CityName'?: string;
    'cbc:PostalZone'?: string;
    'cac:Country': {
      'cbc:IdentificationCode': string; // ISO 3166-1 alpha-2
    };
  };
  'cac:PartyTaxScheme'?: {
    'cbc:CompanyID': string; // VAT number
    'cac:TaxScheme': {
      'cbc:ID': string; // "VAT"
    };
  };
  'cac:PartyLegalEntity'?: {
    'cbc:RegistrationName': string;
    'cac:CompanyID'?: {
      '@_schemeID': string;
      '#': string; // KBO number
    };
  };
}

export interface UBLTaxTotal {
  'cbc:TaxAmount': {
    '@_currencyID': string;
    '#': number;
  };
  'cac:TaxSubtotal': {
    'cbc:TaxableAmount': {
      '@_currencyID': string;
      '#': number;
    };
    'cbc:TaxAmount': {
      '@_currencyID': string;
      '#': number;
    };
    'cac:TaxCategory': {
      'cbc:ID': string; // "S" for standard rate
      'cbc:Percent': number; // VAT percentage
      'cac:TaxScheme': {
        'cbc:ID': string; // "VAT"
      };
    };
  };
}

export interface UBLLegalMonetaryTotal {
  'cbc:LineExtensionAmount': {
    '@_currencyID': string;
    '#': number; // subtotal excl. VAT
  };
  'cbc:TaxExclusiveAmount': {
    '@_currencyID': string;
    '#': number; // same as LineExtensionAmount
  };
  'cbc:TaxInclusiveAmount': {
    '@_currencyID': string;
    '#': number; // total incl. VAT
  };
  'cbc:PayableAmount': {
    '@_currencyID': string;
    '#': number; // same as TaxInclusiveAmount
  };
}

export interface UBLInvoiceLine {
  'cbc:ID': string; // line number (1, 2, 3...)
  'cbc:InvoicedQuantity': {
    '@_unitCode': string; // e.g., "C62" (piece)
    '#': number;
  };
  'cbc:LineExtensionAmount': {
    '@_currencyID': string;
    '#': number; // line total excl. VAT
  };
  'cac:Item': {
    'cbc:Description': string;
  };
  'cac:Price': {
    'cbc:PriceAmount': {
      '@_currencyID': string;
      '#': number; // unit price excl. VAT
    };
  };
  'cac:TaxTotal': {
    'cbc:TaxAmount': {
      '@_currencyID': string;
      '#': number; // VAT amount for this line
    };
    'cac:TaxSubtotal': {
      'cbc:TaxableAmount': {
        '@_currencyID': string;
        '#': number; // line total excl. VAT
      };
      'cbc:TaxAmount': {
        '@_currencyID': string;
        '#': number; // VAT amount
      };
      'cac:TaxCategory': {
        'cbc:ID': string; // "S"
        'cbc:Percent': number; // VAT percentage
        'cac:TaxScheme': {
          'cbc:ID': string; // "VAT"
        };
      };
    };
  };
}

