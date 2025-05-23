declare module 'pdf-parse' {
  interface PDFData {
    numpages: number
    numrender: number
    info: {
      PDFFormatVersion: string
      IsAcroFormPresent: boolean
      IsXFAPresent: boolean
      [key: string]: any
    }
    metadata: any
    text: string
    version: string
  }

  function pdf(dataBuffer: Buffer | ArrayBuffer): Promise<PDFData>
  export = pdf
} 