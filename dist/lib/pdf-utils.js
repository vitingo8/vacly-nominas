/**
 * PDF text extraction placeholder
 * Note: Claude 4.5 Haiku handles PDF processing natively via its document API
 * This function is kept for backward compatibility but not actively used
 */
export async function parsePDF(pdfBuffer) {
    console.warn('parsePDF is deprecated - Claude handles PDFs natively');
    return '';
}
