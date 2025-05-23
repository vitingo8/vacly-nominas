declare module 'pdf-parse' {
  interface PDFInfo {
    PDFFormatVersion: string
    IsAcroFormPresent: boolean
    IsXFAPresent: boolean
    Title?: string
    Author?: string
    Subject?: string
    Keywords?: string
    Creator?: string
    Producer?: string
    CreationDate?: string
    ModDate?: string
    Trapped?: string
  }

  interface PDFMetadata {
    'dc:title'?: string
    'dc:creator'?: string
    'dc:description'?: string
    'dc:subject'?: string
    'pdf:keywords'?: string
    'pdf:producer'?: string
    'xmp:createdate'?: string
    'xmp:modifydate'?: string
    'xmp:metadatadate'?: string
    [key: `pdf:${string}`]: string | undefined
    [key: `dc:${string}`]: string | undefined
    [key: `xmp:${string}`]: string | undefined
  }

  interface PDFData {
    numpages: number
    numrender: number
    info: PDFInfo
    metadata: PDFMetadata
    text: string
    version: string
  }

  function pdf(dataBuffer: Buffer | ArrayBuffer): Promise<PDFData>
  export = pdf
} 