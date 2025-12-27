import type { NextApiRequest, NextApiResponse } from 'next';
import { InvoiceNormalized } from '@/types/invoice';
import { convertToUBL } from '@/mapping/toUbl';
import { validateBusinessRules, buildValidationReport } from '@/validation/rules';
import { validateXSD } from '@/validation/xsd';
import { ConversionResult } from '@/types/invoice';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { normalizedInvoice } = req.body;

    if (!normalizedInvoice) {
      return res.status(400).json({ error: 'Geen factuurdata ontvangen' });
    }

    // Convert to UBL
    const ublXml = convertToUBL(normalizedInvoice as InvoiceNormalized);

    // Validate
    const businessRuleErrors = validateBusinessRules(normalizedInvoice as InvoiceNormalized);
    const xsdWarnings = validateXSD(ublXml);
    const allValidationErrors = [...businessRuleErrors, ...xsdWarnings];
    const validationReport = buildValidationReport(allValidationErrors);

    // Build result
    const result: ConversionResult = {
      ublXml,
      validationReport,
      mappingReport: {
        fields: [],
        missingRequired: [],
        warnings: [],
      },
      normalizedInvoice: normalizedInvoice as InvoiceNormalized,
    };

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Update error:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({
      error: 'Fout bij bijwerken',
      message: error.message || 'Onbekende fout',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

