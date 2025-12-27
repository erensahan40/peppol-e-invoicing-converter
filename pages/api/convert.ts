import type { NextApiRequest, NextApiResponse } from 'next';
import multer from 'multer';
import { parsePDF } from '@/parser/pdf';
import { parseXLSX } from '@/parser/xlsx';
import { parseWithAI } from '@/parser/ai';
import { normalizeInvoice } from '@/mapping/normalize';
import { convertToUBL } from '@/mapping/toUbl';
import { validateBusinessRules, buildValidationReport } from '@/validation/rules';
import { validateDataQuality, calculateDataQualityScore } from '@/validation/dataQuality';
import { validateXSD } from '@/validation/xsd';
import { ConversionResult, MappingReport } from '@/types/invoice';
import { getOrCreateAnonId } from '@/lib/anon-cookie';
import { checkAnonQuota, incrementAnonUsage } from '@/lib/quota';
import { prisma } from '@/lib/prisma';

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowedMimes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Alleen PDF en XLSX bestanden zijn toegestaan'));
    }
  },
});

// Helper to run multer middleware
function runMiddleware(req: NextApiRequest, res: NextApiResponse, fn: any) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get or create anonymous ID
    const anonId = getOrCreateAnonId(req, res);

    // Check quota before processing
    const quotaCheck = await checkAnonQuota(anonId, req);
    if (quotaCheck.rateLimited) {
      return res.status(429).json({
        error: 'Te veel uploads vandaag',
        message: 'Je hebt het dagelijkse uploadlimiet bereikt. Probeer het morgen opnieuw.',
      });
    }

    // Handle file upload
    await runMiddleware(req, res, upload.single('file'));

    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ error: 'Geen bestand geüpload' });
    }

    const buffer = file.buffer;
    const filename = file.originalname;
    const mimetype = file.mimetype;

    // Parse based on file type
    let parseResult;
    if (mimetype === 'application/pdf') {
      parseResult = await parsePDF(buffer, filename);
    } else if (mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      parseResult = await parseXLSX(buffer, filename);
    } else {
      return res.status(400).json({ error: 'Ongeldig bestandstype' });
    }

    // Always use AI for better extraction (if API key is available)
    // AI provides more accurate data extraction, especially for dates and complex layouts
    let finalInvoice = parseResult.invoice;
    let finalMappingFields = parseResult.mappingFields;
    let aiUsed = false;

    // Always try AI parsing for both PDF and Excel if API key is available
    // AI provides much better data extraction, especially for dates and complex layouts
    console.log('[Convert] ========================================');
    console.log('[Convert] Starting conversion process...');
    console.log('[Convert] File:', filename);
    console.log('[Convert] MIME type:', mimetype);
    console.log('[Convert] File size:', buffer.length, 'bytes');
    console.log('[Convert] ========================================');
    
    try {
      console.log('[Convert] 🚀 Attempting AI parsing with Gemini...');
      const aiResult = await parseWithAI(
        buffer,
        filename,
        mimetype,
        parseResult.invoice,
        parseResult.mappingFields
      );
      
      console.log('[Convert] AI parsing result:', {
        aiUsed: aiResult.aiUsed,
        hasInvoice: !!aiResult.invoice,
        hasIssueDate: !!aiResult.invoice?.issueDate,
        hasInvoiceNumber: !!aiResult.invoice?.invoiceNumber,
      });
      
      if (aiResult.aiUsed) {
        finalInvoice = aiResult.invoice;
        finalMappingFields = aiResult.mappingFields;
        aiUsed = true;
        console.log('[Convert] ✅✅✅ AI parsing SUCCESSFULLY applied!');
        console.log('[Convert] Using AI-extracted data for conversion');
        console.log('[Convert] Issue date from AI:', finalInvoice.issueDate);
        console.log('[Convert] Invoice number from AI:', finalInvoice.invoiceNumber);
      } else {
        console.log('[Convert] ⚠️ AI parsing returned aiUsed=false');
        console.log('[Convert] Using regular parsing results');
      }
    } catch (aiError: any) {
      console.error('[Convert] ========================================');
      console.error('[Convert] ❌❌❌ AI PARSING FAILED!');
      console.error('[Convert] Error message:', aiError.message);
      console.error('[Convert] Error stack:', aiError.stack);
      console.error('[Convert] Continuing with regular parsing...');
      console.error('[Convert] ========================================');
      // Continue with regular parsing if AI fails - don't break the conversion
    }

    // Normalize invoice data
    const normalizedInvoice = normalizeInvoice(finalInvoice);

    // Convert to UBL
    const ublXml = convertToUBL(normalizedInvoice);

    // Validate
    const businessRuleErrors = validateBusinessRules(normalizedInvoice);
    const dataQualityErrors = validateDataQuality(normalizedInvoice, finalMappingFields);
    const xsdWarnings = validateXSD(ublXml);
    const allValidationErrors = [...businessRuleErrors, ...dataQualityErrors, ...xsdWarnings];
    const validationReport = buildValidationReport(allValidationErrors);

    // Calculate data quality score
    const qualityScore = calculateDataQualityScore(
      normalizedInvoice,
      finalMappingFields,
      allValidationErrors
    );

    // Build mapping report
    const mappingReport: MappingReport = {
      fields: finalMappingFields,
      missingRequired: findMissingRequiredFields(normalizedInvoice, validationReport),
      warnings: aiUsed ? ['AI enhancement toegepast voor betere data extractie'] : [],
      dataQuality: qualityScore,
    };

    // Determine if conversion is successful (valid enough for download)
    const isSuccess = validationReport.isValid || validationReport.errors.length === 0;

    // Create preview XML (truncate to first 50 lines)
    const xmlLines = ublXml.split('\n');
    const previewXml = xmlLines.slice(0, 50).join('\n') + (xmlLines.length > 50 ? '\n<!-- ... truncated ... -->' : '');

    // Store conversion in database
    const conversion = await prisma.conversion.create({
      data: {
        ownerType: 'ANON',
        ownerId: anonId,
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        filename: filename,
        inputType: mimetype === 'application/pdf' ? 'pdf' : 'xlsx',
        previewXml: previewXml,
        fullXml: ublXml, // Store full XML (will be accessible after download payment)
        validationJson: validationReport as any,
        mappingJson: mappingReport as any,
        normalizedInvoiceJson: normalizedInvoice as any,
        success: isSuccess,
        originalFileName: filename,
      },
    });

    // Increment quota if successful (only count successful conversions towards free limit)
    if (isSuccess && quotaCheck.hasQuota) {
      await incrementAnonUsage(anonId, true, req);
      // Update quota check after increment
      quotaCheck.freeLeft = Math.max(0, quotaCheck.freeLeft - 1);
      quotaCheck.hasQuota = quotaCheck.freeLeft > 0;
      quotaCheck.isLimited = quotaCheck.freeLeft === 0;
    } else if (!isSuccess) {
      // Still increment total count for rate limiting, but not success count
      await incrementAnonUsage(anonId, false, req);
    }

    // Convert file buffer to base64 for frontend display
    const originalFileBase64 = buffer.toString('base64');

    // Build result with new fields
    const result = {
      conversionId: conversion.id,
      success: isSuccess,
      validationReport,
      mappingReport,
      xmlPreview: previewXml, // Only preview, not full XML
      canDownloadFull: false, // Always false for anonymous users
      needsLoginToDownload: true,
      quota: {
        freeLeft: quotaCheck.freeLeft,
        isLimited: quotaCheck.isLimited,
      },
      normalizedInvoice,
      originalFile: {
        data: originalFileBase64,
        mimeType: mimetype,
        filename: filename,
      },
    };

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Conversion error:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({
      error: 'Fout bij conversie',
      message: error.message || 'Onbekende fout',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

function findMissingRequiredFields(
  invoice: any,
  validationReport: { errors: any[]; warnings: any[] }
): string[] {
  const missing: string[] = [];

  // Check both errors and warnings for missing fields
  [...validationReport.errors, ...validationReport.warnings].forEach((error) => {
    if (error.code.startsWith('WARN_MISSING_') || error.code.startsWith('ERR_MISSING_')) {
      missing.push(error.fieldPath || error.code);
    }
  });

  return missing;
}

