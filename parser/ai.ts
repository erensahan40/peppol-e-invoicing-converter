import { InvoiceNormalized, MappingField } from '@/types/invoice';

/**
 * AI-powered invoice parsing using OpenAI GPT-4 or Google Gemini
 * This enhances the regular parsing by using AI to extract and validate data
 */
export async function parseWithAI(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  existingInvoice: InvoiceNormalized,
  existingMappingFields: MappingField[]
): Promise<{
  invoice: InvoiceNormalized;
  mappingFields: MappingField[];
  aiUsed: boolean;
}> {
  // ALWAYS use Gemini if available (free tier) - don't use OpenAI if Gemini is available
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  
  // Debug logging - show what keys are found
  console.log('[AI] ========================================');
  console.log('[AI] Checking API keys:');
  console.log('[AI] - GEMINI_API_KEY:', geminiKey ? `Found (${geminiKey.length} chars, starts with: ${geminiKey.substring(0, 10)}...)` : 'NOT FOUND');
  console.log('[AI] - OPENAI_API_KEY:', openaiKey ? `Found (${openaiKey.length} chars)` : 'NOT FOUND');
  console.log('[AI] ========================================');
  
  // ONLY use Gemini if available - don't fallback to OpenAI
  if (!geminiKey) {
    console.warn('[AI] ❌ GEMINI_API_KEY not found - skipping AI parsing');
    console.warn('[AI] Add GEMINI_API_KEY to .env file to enable AI parsing');
    return {
      invoice: existingInvoice,
      mappingFields: existingMappingFields,
      aiUsed: false,
    };
  }
  
  console.log('[AI] ✅ GEMINI_API_KEY found - will use Gemini for AI parsing');

  try {
    // Always use AI if API key is available - it provides better extraction
    console.log('AI Parsing - Starting AI analysis...');

    // Extract text from PDF or Excel for AI analysis
    let extractedText = '';
    if (mimeType === 'application/pdf') {
      try {
        const pdfParse = (await import('pdf-parse')).default;
        const pdfData = await pdfParse(buffer);
        extractedText = pdfData.text;
        console.log(`[AI] Extracted ${extractedText.length} characters from PDF`);
      } catch (pdfError) {
        console.warn('[AI] Failed to extract text from PDF:', pdfError);
        // Continue without text extraction
      }
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      try {
        // For Excel, we can extract cell values as text
        const XLSX = (await import('xlsx')).default;
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        // Convert to text representation
        extractedText = data.map((row: any) => Array.isArray(row) ? row.join(' | ') : String(row)).join('\n');
        console.log(`[AI] Extracted ${extractedText.length} characters from Excel`);
      } catch (excelError) {
        console.warn('[AI] Failed to extract text from Excel:', excelError);
        // Continue without text extraction
      }
    }

    // Prepare the prompt for AI analysis
    const prompt = buildAIPrompt(existingInvoice, existingMappingFields, extractedText);

    // ONLY use Gemini - don't use OpenAI
    console.log('[AI] Starting Gemini API call...');
    let aiResponse: any;
    let aiProvider = 'gemini';

    try {
      aiResponse = await callGeminiAPI(geminiKey, prompt, extractedText, mimeType, buffer);
      console.log('[AI] ✅ Successfully used Google Gemini (FREE)');
    } catch (geminiError: any) {
      console.error('[AI] ❌ Gemini API failed:', geminiError.message);
      console.error('[AI] Error details:', geminiError);
      // Re-throw the error - don't fallback to OpenAI
      throw geminiError;
    }

    if (!aiResponse) {
      throw new Error('Gemini API returned no response');
    }
    
    console.log('✅ AI Parsing - Successfully extracted data:', {
      hasInvoiceNumber: !!aiResponse.invoiceNumber,
      hasIssueDate: !!aiResponse.issueDate,
      hasSupplier: !!aiResponse.supplier,
      hasCustomer: !!aiResponse.customer,
      linesCount: aiResponse.lines?.length || 0,
    });

    // Merge AI results with existing data
    const enhancedInvoice = mergeAIResults(existingInvoice, aiResponse);
    const enhancedMappingFields = mergeAIMappingFields(
      existingMappingFields,
      aiResponse,
      `ai-${aiProvider}`
    );

    return {
      invoice: enhancedInvoice,
      mappingFields: enhancedMappingFields,
      aiUsed: true,
    };
  } catch (error: any) {
    console.error('[AI] ========================================');
    console.error('[AI] ❌ AI PARSING ERROR:');
    console.error('[AI] Error message:', error.message);
    console.error('[AI] Error stack:', error.stack);
    console.error('[AI] ========================================');
    // Fallback to existing parsing if AI fails
    return {
      invoice: existingInvoice,
      mappingFields: existingMappingFields,
      aiUsed: false,
    };
  }
}

/**
 * Determine if AI enhancement is needed
 * Always use AI if API key is available for best results
 */
function shouldUseAI(invoice: InvoiceNormalized, mappingFields: MappingField[]): boolean {
  // Always use AI if available - it provides better extraction
  // The API key check happens in the main function
  return true;
}

/**
 * Build prompt for AI analysis
 */
function buildAIPrompt(invoice: InvoiceNormalized, mappingFields: MappingField[], extractedText?: string): string {
  return `Analyseer de factuur en extraheer ALLE gegevens. ${extractedText ? `\n\nAanvullende geëxtraheerde tekst (maar gebruik vooral het PDF document hierboven):\n\n${extractedText.substring(0, 5000)}\n\n` : ''}Geef een JSON object terug met de volgende structuur:

{
  "invoiceNumber": "factuurnummer als string",
  "issueDate": "YYYY-MM-DD formaat",
  "dueDate": "YYYY-MM-DD formaat of null",
  "currency": "EUR, USD, etc.",
  "supplier": {
    "name": "leveranciersnaam",
    "address": {
      "street": "straat en nummer",
      "city": "stad",
      "postalCode": "postcode",
      "countryCode": "BE, NL, etc. (2 letters)"
    },
    "vatNumber": "BTW nummer"
  },
  "customer": {
    "name": "klantnaam",
    "address": {
      "street": "straat en nummer",
      "city": "stad",
      "postalCode": "postcode",
      "countryCode": "BE, NL, etc. (2 letters)"
    },
    "vatNumber": "BTW nummer"
  },
  "lines": [
    {
      "description": "product omschrijving",
      "quantity": aantal als nummer,
      "unitPrice": prijs per eenheid als nummer,
      "vatRate": BTW percentage als nummer (bijv. 21 voor 21%),
      "lineTotal": totaal voor deze regel als nummer
    }
  ],
  "subtotalExclVat": subtotaal excl BTW als nummer,
  "vatTotal": totaal BTW als nummer,
  "totalInclVat": totaal incl BTW als nummer,
  "iban": "IBAN nummer indien aanwezig",
  "paymentReference": "betalingsreferentie indien aanwezig"
}

KRITIEKE INSTRUCTIES:
- Gebruik ALLEEN gegevens die je DAADWERKELIJK in het PDF document ziet
- Als een veld niet aanwezig is, gebruik null of laat het weg
- Alle datums moeten in YYYY-MM-DD formaat zijn (bijv. 2024-01-15)

⚠️ FACTUURDATUM (issueDate) IS VERPLICHT:
- Zoek GRONDIG in het PDF document naar de factuurdatum
- Zoek naar: "factuurdatum", "invoice date", "datum", "date", "Datum factuur", "Invoice Date"
- De datum kan overal staan: header, footer, rechtsboven, linksboven, midden
- Accepteer verschillende datumformaten en converteer naar YYYY-MM-DD
- Als je EEN datum ziet in het document, gebruik die als factuurdatum
- Als je MEERDERE datums ziet, gebruik de datum die het meest logisch is als factuurdatum

Andere velden:
- Landcodes: 2 letters (ISO 3166-1 alpha-2): BE, NL, DE, FR, etc.
- BTW percentages: nummers (bijv. 21 voor 21%, niet 0.21)
- Bedragen: nummers zonder valuta symbool
- Factuurnummers: exact overnemen zoals in de factuur

${invoice.issueDate ? `⚠️ Huidige geëxtraheerde datum: ${invoice.issueDate} - maar controleer het PDF document om zeker te zijn` : '🚨 FACTUURDATUM NIET GEVONDEN - ZOEK GRONDIG IN HET PDF DOCUMENT HIERBOVEN'}
${invoice.invoiceNumber ? `Huidige factuurnummer: ${invoice.invoiceNumber}` : '⚠️ Factuurnummer niet gevonden - zoek in het PDF'}
${invoice.supplier?.name ? `Huidige leverancier: ${invoice.supplier.name}` : '⚠️ Leverancier niet gevonden'}
${invoice.customer?.name ? `Huidige klant: ${invoice.customer.name}` : '⚠️ Klant niet gevonden'}

🚨 BELANGRIJKSTE: Als de factuurdatum WEL in het PDF document staat maar hierboven als "NIET GEVONDEN" staat, dan MOET je die datum extraheren uit het PDF document dat je hierboven ziet!`;
}

/**
 * Merge AI results with existing invoice data
 */
function mergeAIResults(
  existing: InvoiceNormalized,
  aiData: any
): InvoiceNormalized {
  // AI results take priority - they are more accurate
  // Only fall back to existing if AI didn't find something
  const merged: InvoiceNormalized = {
    ...existing,
    // Prefer AI data - it's more reliable
    invoiceNumber: aiData.invoiceNumber || existing.invoiceNumber,
    issueDate: aiData.issueDate ? parseDate(aiData.issueDate) : existing.issueDate,
    dueDate: aiData.dueDate ? parseDate(aiData.dueDate) : existing.dueDate,
    currency: aiData.currency || existing.currency || 'EUR',
    supplier: mergeParty(existing.supplier, aiData.supplier),
    customer: mergeParty(existing.customer, aiData.customer),
    lines: aiData.lines && aiData.lines.length > 0 ? aiData.lines : existing.lines,
    subtotalExclVat: aiData.subtotalExclVat !== undefined && aiData.subtotalExclVat !== null ? aiData.subtotalExclVat : existing.subtotalExclVat,
    vatTotal: aiData.vatTotal !== undefined && aiData.vatTotal !== null ? aiData.vatTotal : existing.vatTotal,
    totalInclVat: aiData.totalInclVat !== undefined && aiData.totalInclVat !== null ? aiData.totalInclVat : existing.totalInclVat,
    iban: aiData.iban || existing.iban,
    paymentReference: aiData.paymentReference || existing.paymentReference,
  };

  return merged;
}

/**
 * Parse date string to Date object
 */
function parseDate(dateStr: string | null | undefined): Date | undefined {
  if (!dateStr || dateStr === 'null' || dateStr === '') return undefined;
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      // Try parsing different formats
      const formats = [
        /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
        /(\d{2})\/(\d{2})\/(\d{4})/, // DD/MM/YYYY
        /(\d{2})-(\d{2})-(\d{4})/, // DD-MM-YYYY
        /(\d{2})\.(\d{2})\.(\d{4})/, // DD.MM.YYYY
      ];
      
      for (const format of formats) {
        const match = dateStr.match(format);
        if (match) {
          if (format === formats[0]) {
            return new Date(`${match[1]}-${match[2]}-${match[3]}`);
          } else {
            // Assume DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
            return new Date(`${match[3]}-${match[2]}-${match[1]}`);
          }
        }
      }
      
      return undefined;
    }
    return date;
  } catch {
    return undefined;
  }
}

/**
 * Merge party data
 */
function mergeParty(existing: any, aiData: any): any {
  if (!aiData) return existing;
  if (!existing) return aiData;

  // Prefer AI data - it's more accurate
  return {
    name: aiData.name || existing.name,
    address: {
      street: aiData.address?.street || existing.address?.street,
      city: aiData.address?.city || existing.address?.city,
      postalCode: aiData.address?.postalCode || existing.address?.postalCode,
      countryCode: aiData.address?.countryCode || existing.address?.countryCode,
    },
    vatNumber: aiData.vatNumber || existing.vatNumber,
    kboNumber: aiData.kboNumber || existing.kboNumber,
    taxRegistrationId: aiData.taxRegistrationId || existing.taxRegistrationId,
  };
}

/**
 * Merge AI mapping fields with existing ones
 */
function mergeAIMappingFields(
  existing: MappingField[],
  aiData: any,
  source: string
): MappingField[] {
  const aiFields: MappingField[] = [];
  const existingFieldMap = new Map(existing.map((f) => [f.field, f]));

  // Add AI-extracted fields with high confidence
  if (aiData.invoiceNumber) {
    aiFields.push({
      field: 'invoiceNumber',
      value: aiData.invoiceNumber,
      source,
      confidence: 0.9,
      rawValue: aiData.invoiceNumber,
    });
  }

  if (aiData.issueDate) {
    aiFields.push({
      field: 'issueDate',
      value: aiData.issueDate,
      source,
      confidence: 0.9,
      rawValue: aiData.issueDate,
    });
  }

  if (aiData.supplier?.name) {
    aiFields.push({
      field: 'supplier.name',
      value: aiData.supplier.name,
      source,
      confidence: 0.9,
      rawValue: aiData.supplier.name,
    });
  }

  if (aiData.customer?.name) {
    aiFields.push({
      field: 'customer.name',
      value: aiData.customer.name,
      source,
      confidence: 0.9,
      rawValue: aiData.customer.name,
    });
  }

  // Merge: prefer AI fields - they have higher confidence (0.9)
  const merged: MappingField[] = [];
  const processedFields = new Set<string>();

  // First add all AI fields (they take priority)
  aiFields.forEach((aiField) => {
    merged.push(aiField);
    processedFields.add(aiField.field);
  });

  // Then add existing fields that weren't found by AI
  existing.forEach((field) => {
    if (!processedFields.has(field.field)) {
      merged.push(field);
      processedFields.add(field.field);
    }
  });

  // Add new AI fields that weren't in existing
  aiFields.forEach((aiField) => {
    if (!processedFields.has(aiField.field)) {
      merged.push(aiField);
    }
  });

  return merged;
}

/**
 * Call Google Gemini API (FREE tier available)
 * Gemini 1.5 Flash is free and perfect for document analysis
 * Get your free API key: https://aistudio.google.com/app/apikey
 * 
 * IMPORTANT: This function sends the ACTUAL DOCUMENT to Gemini so it can read it directly
 */
async function callGeminiAPI(
  apiKey: string,
  prompt: string,
  extractedText: string,
  mimeType: string,
  buffer: Buffer
): Promise<any> {
  // Use the correct Gemini model for document analysis
  // Based on official docs: gemini-2.5-flash is available
  // Try v1beta first (supports documents and responseMimeType)
  let url: string;
  
  // Use gemini-2.5-flash with v1beta API (latest model, supports PDF documents)
  url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  console.log('[AI] Using gemini-2.5-flash (v1beta) for document analysis');
  
  // Convert buffer to base64 for Gemini to read the document directly
  const base64Data = buffer.toString('base64');
  
  // Determine the MIME type for Gemini
  let geminiMimeType = mimeType;
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    // For Excel, we'll send it as PDF or convert to text
    // Gemini can read Excel if we convert it, but for now let's use the extracted text + document
    geminiMimeType = 'application/pdf'; // We'll handle Excel differently
  }
  
  console.log('[AI] Gemini API - Preparing to send document directly to Gemini');
  console.log('[AI] Gemini API - Document type:', mimeType);
  console.log('[AI] Gemini API - Document size:', buffer.length, 'bytes');
  console.log('[AI] Gemini API - Base64 size:', base64Data.length, 'characters');
  
  // Build the request with the ACTUAL DOCUMENT
  const parts: any[] = [];
  
  // For PDFs, send the document directly so Gemini can READ IT
  // IMPORTANT: Put the document FIRST, then the prompt
  if (mimeType === 'application/pdf') {
    console.log('[AI] Gemini API - Sending PDF document DIRECTLY to Gemini');
    console.log('[AI] Gemini API - Gemini will READ the actual PDF document');
    console.log('[AI] Gemini API - PDF size:', buffer.length, 'bytes');
    console.log('[AI] Gemini API - Base64 length:', base64Data.length, 'chars');
    
    // Add PDF document FIRST - Gemini will read this visually
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: base64Data
      }
    });
    console.log('[AI] Gemini API - PDF document added to request');
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    // For Excel, Gemini doesn't support Excel directly, but we can send a comprehensive text representation
    // We'll create a detailed text representation that includes all data
    console.log('[AI] Gemini API - Excel file detected, creating comprehensive text representation');
    // The extractedText already contains all Excel data, we'll use that
  }
  
  // Build enhanced prompt that emphasizes reading the document
  let enhancedPrompt = prompt;
  
  if (mimeType === 'application/pdf') {
    // For PDFs, Gemini reads the document directly, so emphasize that
    enhancedPrompt = `Je ziet nu het DAADWERKELIJKE PDF document van de factuur. Je moet dit document VISUEEL lezen en analyseren.

BELANGRIJK - LEES HET DOCUMENT:
1. Het PDF document staat hierboven - scroll omhoog en bekijk het document
2. Zoek naar de FACTUURDATUM - deze kan staan als:
   - "Factuurdatum", "Invoice date", "Datum", "Date"
   - In de header, footer, of in een datumveld
   - In verschillende formaten: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD
3. Extraheer ALLE gegevens die je in het document ziet

${prompt}

EXTRA INSTRUCTIES VOOR HET PDF:
- Je ziet het ECHTE PDF document - lees het visueel
- De factuurdatum staat ERGENS in het document - zoek grondig
- Als je een datum ziet maar niet zeker bent of het de factuurdatum is, gebruik die datum
- Controleer ALLE tekst in het document, niet alleen de geëxtraheerde tekst hieronder
- Gebruik wat je ZIET in het PDF, niet alleen wat hieronder staat`;
  } else {
    // For Excel, use the extracted text
    enhancedPrompt = prompt + (extractedText ? `\n\nBELANGRIJK: Analyseer deze factuurgegevens grondig. Hier zijn ALLE gegevens uit de Excel factuur:\n\n${extractedText.substring(0, 20000)}\n\nExtraheer alle beschikbare informatie uit bovenstaande gegevens.` : '');
  }
  
  // Add prompt AFTER the document
  parts.push({
    text: enhancedPrompt
  });
  
  console.log('[AI] Gemini API - Total parts in request:', parts.length);
  console.log('[AI] Gemini API - Part 1 type:', parts[0]?.inlineData ? 'PDF Document' : 'Text');
  console.log('[AI] Gemini API - Part 2 type:', parts[1]?.text ? 'Text Prompt' : 'N/A');
  
  const requestBody: any = {
    contents: [{
      parts: parts
    }],
    generationConfig: {
      responseMimeType: 'application/json', // Available in v1beta
      temperature: 0.1, // Low temperature for consistent, accurate extraction
    }
  };

  console.log('[AI] Gemini API - Sending request...');
  console.log('[AI] Gemini API - URL:', url.replace(apiKey, '***'));
  console.log('[AI] Gemini API - Request body size:', JSON.stringify(requestBody).length, 'chars');
  console.log('[AI] Gemini API - Has PDF document:', mimeType === 'application/pdf' ? 'YES' : 'NO');
  console.log('[AI] Gemini API - Prompt length:', enhancedPrompt.length, 'chars');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let error;
    try {
      error = JSON.parse(errorText);
    } catch {
      error = { error: { message: errorText || 'Unknown error' } };
    }
    console.error('[AI] Gemini API error response:', error);
    
    // If PDF inline data failed, retry with text-only (using extracted text from PDF)
    if (mimeType === 'application/pdf' && parts[0]?.inlineData && extractedText) {
      console.log('[AI] PDF inline data failed, retrying with extracted text only...');
      console.log('[AI] Using extracted text from PDF:', extractedText.length, 'characters');
      
      // Build a text-only prompt with the extracted PDF text
      const textOnlyPrompt = `Analyseer deze factuurgegevens die zijn geëxtraheerd uit een PDF document. Extraheer ALLE beschikbare informatie, vooral de FACTUURDATUM.

BELANGRIJK: Zoek grondig naar de factuurdatum in de onderstaande tekst. Deze kan staan als:
- "Factuurdatum", "Invoice date", "Datum", "Date", "Datum factuur"
- In verschillende formaten: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD

Geëxtraheerde tekst uit de PDF:
${extractedText.substring(0, 15000)}

${prompt}`;
      
      // Remove PDF part, keep only text
      const textOnlyParts = [{
        text: textOnlyPrompt
      }];
      
      const textOnlyBody = {
        contents: [{
          parts: textOnlyParts
        }],
        generationConfig: {
          responseMimeType: 'application/json', // Available in v1beta
          temperature: 0.1,
        }
      };
      
      const retryResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(textOnlyBody),
      });
      
      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        const retryContent = retryData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (retryContent) {
          console.log('[AI] ✅ Retry with text-only succeeded!');
          let jsonText = retryContent.trim();
          if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '').trim();
          }
          return JSON.parse(jsonText);
        }
      }
    }
    
    throw new Error(`Gemini API error: ${error.error?.message || errorText || 'Unknown error'}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!content) {
    console.error('[AI] Gemini API - Empty response:', JSON.stringify(data, null, 2));
    throw new Error('Gemini returned empty response');
  }

  console.log('[AI] Gemini API - Received response, length:', content.length);

  // Parse JSON from response
  try {
    // Gemini with responseMimeType should return clean JSON
    let jsonText = content.trim();
    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '').trim();
    }
    
    const parsed = JSON.parse(jsonText);
    console.log('[AI] Gemini API - Successfully parsed JSON response');
    return parsed;
  } catch (parseError: any) {
    console.error('[AI] Failed to parse Gemini response. Content preview:', content.substring(0, 500));
    console.error('[AI] Parse error:', parseError.message);
    throw new Error(`Gemini returned invalid JSON response: ${parseError.message}`);
  }
}

/**
 * Call OpenAI API
 */
async function callOpenAIAPI(apiKey: string, prompt: string): Promise<any> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini', // Cheaper alternative, or use 'gpt-4o' for better results
      messages: [
        {
          role: 'system',
          content: 'Je bent een expert in het analyseren van facturen en het extraheren van gestructureerde gegevens. Je analyseert facturen en geeft alleen JSON terug met de gevonden gegevens.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  
  try {
    return typeof content === 'string' ? JSON.parse(content) : content;
  } catch (parseError) {
    console.error('Failed to parse OpenAI response:', content.substring(0, 200));
    throw new Error('OpenAI returned invalid JSON response');
  }
}
