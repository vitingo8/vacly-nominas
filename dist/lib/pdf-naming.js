import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});
// Model configuration
const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";
/**
 * Extrae información básica de una nómina para generar nombres de archivo
 * ACTUALIZADO: Usa Claude 4.5 Haiku con soporte PDF nativo
 */
export async function extractBasicNominaInfo(pdfBuffer) {
    try {
        if (!process.env.ANTHROPIC_API_KEY) {
            throw new Error('Anthropic API key not configured');
        }
        const prompt = `Analiza esta nómina PDF y extrae ÚNICAMENTE la siguiente información básica:

1. Nombre de la empresa (busca "empresa", "razón social", "entidad", etc.)
2. Nombre del empleado/trabajador (busca "empleado", "trabajador", "nombre", etc.)
3. Período de la nómina en formato YYYYMM (busca fechas como "enero 2024", "01/2024", "2024-01", etc.)

Responde ÚNICAMENTE con un objeto JSON en este formato exacto:
{
  "companyName": "nombre de la empresa",
  "employeeName": "nombre del empleado", 
  "period": "YYYYMM"
}

Si no encuentras algún dato, usa "Desconocido" para nombres y "202401" para el período.`;
        const response = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 4000,
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: prompt
                        },
                        {
                            type: "document",
                            source: {
                                type: "base64",
                                media_type: "application/pdf",
                                data: pdfBuffer.toString('base64')
                            }
                        }
                    ]
                }
            ],
        });
        if (!response.content[0] || response.content[0].type !== 'text') {
            throw new Error('Invalid response from Claude API');
        }
        let cleanedResponse = response.content[0].text.trim();
        // Clean the response - remove any markdown formatting
        if (cleanedResponse.includes('```json')) {
            cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
        }
        else if (cleanedResponse.includes('```')) {
            cleanedResponse = cleanedResponse.replace(/```\s*/g, '').replace(/```\s*$/g, '');
        }
        // Find the JSON object
        const firstBrace = cleanedResponse.indexOf('{');
        const lastBrace = cleanedResponse.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1);
        }
        const basicInfo = JSON.parse(cleanedResponse);
        // Validate and clean the extracted data
        return {
            companyName: sanitizeFileName(basicInfo.companyName || 'Desconocido'),
            employeeName: sanitizeFileName(basicInfo.employeeName || 'Desconocido'),
            period: validatePeriod(basicInfo.period || '202401')
        };
    }
    catch (error) {
        console.error('Error extracting basic nomina info with Haiku 3.5:', error);
        // Fallback: try to extract period from text using regex
        const currentDate = new Date();
        const fallbackPeriod = `${currentDate.getFullYear()}${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        return {
            companyName: 'Desconocido',
            employeeName: 'Desconocido',
            period: fallbackPeriod
        };
    }
}
/**
 * DEPRECATED: Función antigua que usa texto OCR
 * Mantenida para compatibilidad hacia atrás
 */
export async function extractBasicNominaInfoFromText(textContent) {
    try {
        if (!process.env.ANTHROPIC_API_KEY) {
            throw new Error('Anthropic API key not configured');
        }
        const prompt = `Analiza este texto de nómina y extrae ÚNICAMENTE la siguiente información básica:

1. Nombre de la empresa (busca "empresa", "razón social", "entidad", etc.)
2. Nombre del empleado/trabajador (busca "empleado", "trabajador", "nombre", etc.)
3. Período de la nómina en formato YYYYMM (busca fechas como "enero 2024", "01/2024", "2024-01", etc.)

Responde ÚNICAMENTE con un objeto JSON en este formato exacto:
{
  "companyName": "nombre de la empresa",
  "employeeName": "nombre del empleado",
  "period": "YYYYMM"
}

Si no encuentras algún dato, usa "Desconocido" para nombres y "202401" para el período.

Texto de la nómina:
${textContent}`;
        const response = await anthropic.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 4000,
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
        });
        if (!response.content[0] || response.content[0].type !== 'text') {
            throw new Error('Invalid response from Claude API');
        }
        let cleanedResponse = response.content[0].text.trim();
        // Clean the response - remove any markdown formatting
        if (cleanedResponse.includes('```json')) {
            cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
        }
        else if (cleanedResponse.includes('```')) {
            cleanedResponse = cleanedResponse.replace(/```\s*/g, '').replace(/```\s*$/g, '');
        }
        // Find the JSON object
        const firstBrace = cleanedResponse.indexOf('{');
        const lastBrace = cleanedResponse.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1);
        }
        const basicInfo = JSON.parse(cleanedResponse);
        // Validate and clean the extracted data
        return {
            companyName: sanitizeFileName(basicInfo.companyName || 'Desconocido'),
            employeeName: sanitizeFileName(basicInfo.employeeName || 'Desconocido'),
            period: validatePeriod(basicInfo.period || '202401')
        };
    }
    catch (error) {
        console.error('Error extracting basic nomina info:', error);
        // Fallback: try to extract period from text using regex
        const currentDate = new Date();
        const fallbackPeriod = `${currentDate.getFullYear()}${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        return {
            companyName: 'Desconocido',
            employeeName: 'Desconocido',
            period: fallbackPeriod
        };
    }
}
/**
 * Corrige el formato de nombres de "APELLIDOS, NOMBRE" a "NOMBRE APELLIDOS"
 */
export function correctNameFormat(name) {
    if (!name || typeof name !== 'string')
        return name;
    // Si el nombre contiene una coma, probablemente está en formato "APELLIDOS, NOMBRE"
    if (name.includes(',')) {
        const parts = name.split(',').map(part => part.trim());
        if (parts.length === 2) {
            // Intercambiar: parts[0] = apellidos, parts[1] = nombre
            return `${parts[1]} ${parts[0]}`;
        }
    }
    // Si no tiene coma, devolver tal como está
    return name;
}
/**
 * Sanitiza un nombre para usarlo como nombre de archivo
 */
export function sanitizeFileName(name) {
    return name
        .normalize('NFD') // Normalizar caracteres Unicode
        .replace(/[\u0300-\u036f]/g, '') // Remover acentos y diacríticos
        .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
        .replace(/[ñÑ]/g, (match) => match === 'ñ' ? 'n' : 'N') // Replace ñ with n
        .replace(/[^a-zA-Z0-9\s\-_.]/g, '') // Keep only alphanumeric, spaces, hyphens, underscores, dots
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim()
        .substring(0, 50); // Limit length
}
/**
 * Valida y formatea el período en formato YYYYMM
 */
export function validatePeriod(period) {
    // Try to extract YYYYMM from various formats
    const yearMonthRegex = /(\d{4})[-\/]?(\d{1,2})/;
    const match = period.match(yearMonthRegex);
    if (match) {
        const year = match[1];
        const month = String(parseInt(match[2])).padStart(2, '0');
        return `${year}${month}`;
    }
    // If no valid format found, return current YYYYMM
    const currentDate = new Date();
    return `${currentDate.getFullYear()}${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
}
/**
 * Genera el nombre del archivo global
 */
export function generateGlobalFileName(companyName, period) {
    return `${period}_${companyName}.pdf`;
}
/**
 * Genera el nombre del archivo split
 */
export function generateSplitFileName(employeeName, period, pageNumber) {
    return `${period}_${employeeName}.pdf`;
}
/**
 * Genera el nombre del archivo de texto
 */
export function generateTextFileName(employeeName, period, pageNumber) {
    return `${period}_${employeeName}.txt`;
}
