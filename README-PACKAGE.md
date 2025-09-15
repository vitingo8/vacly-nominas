# @vacly/nominas-processor

Procesador inteligente de nóminas con IA para extracción y análisis de datos de documentos PDF.

## 🚀 Instalación

```bash
npm install @vacly/nominas-processor
```

## 📋 Requisitos

- Node.js 18+
- Cuenta de Supabase
- API Key de Anthropic Claude
- (Opcional) API Key de Voyage AI para embeddings

## 🔧 Configuración Básica

```typescript
import { createNominaProcessor, VaclyConfig } from '@vacly/nominas-processor';

const config: VaclyConfig = {
  supabaseUrl: 'your-supabase-url',
  supabaseServiceKey: 'your-service-key',
  anthropicApiKey: 'your-anthropic-key',
  voyageApiKey: 'your-voyage-key', // opcional
};

const processor = createNominaProcessor(config);
```

## 📖 Uso

### Procesar un archivo PDF

```typescript
import fs from 'fs';

// Procesar desde Buffer
const pdfBuffer = fs.readFileSync('nominas.pdf');
const result = await processor.processDocument(pdfBuffer);

console.log(`Procesadas ${result.processedPages} páginas de ${result.totalPages}`);
result.documents.forEach(doc => {
  console.log(`- ${doc.filename}: ${doc.claudeProcessed ? '✅' : '❌'}`);
});
```

### Extraer información básica

```typescript
// Desde texto
const basicInfo = await processor.extractBasicInfo(textContent);
console.log(basicInfo);
// { companyName: "Empresa SL", employeeName: "Juan Pérez", period: "202401" }

// Desde PDF buffer
const basicInfo = await processor.extractBasicInfo(pdfBuffer);
```

### Generar nombres de archivo

```typescript
const filename = processor.generateFileName("Juan García", "202401", 1);
console.log(filename); // "202401_Juan García.pdf"
```

## 🔍 API Avanzada

### Usando funciones de API directamente

```typescript
import { 
  getNominas, 
  searchNominas, 
  processNominaFile,
  createVaclyClient 
} from '@vacly/nominas-processor/api';

// Obtener todas las nóminas
const response = await getNominas(config, {
  limit: 10,
  offset: 0,
  companyId: 'company-uuid'
});

if (response.success) {
  console.log('Nóminas:', response.data);
}

// Buscar nóminas
const searchResult = await searchNominas(config, {
  employeeName: 'Juan',
  period: '202401'
});

// Procesar archivo
const processResult = await processNominaFile(pdfBuffer, config);
```

### Usando funciones específicas de la librería

```typescript
import { 
  extractBasicNominaInfo,
  generateSplitFileName,
  parsePDF,
} from '@vacly/nominas-processor/lib';

// Extraer información específica
const info = await extractBasicNominaInfo(pdfBuffer);

// Generar nombres de archivo
const filename = generateSplitFileName("Ana López", "202401", 1);

// Procesar PDF
const text = await parsePDF(pdfBuffer);


## 📊 Tipos TypeScript

El paquete incluye tipos TypeScript completos:

```typescript
import type { 
  NominaData,
  ProcessingResult,
  BasicNominaInfo,
  SplitDocument,
  VaclyConfig 
} from '@vacly/nominas-processor';
```

## 🔧 Configuración Avanzada

```typescript
const config: VaclyConfig = {
  supabaseUrl: 'your-url',
  supabaseServiceKey: 'your-key',
  anthropicApiKey: 'your-key',
  voyageApiKey: 'your-key',
  options: {
    enableMemory: true,
    enableEmbeddings: true,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxPages: 50
  }
};
```

## 📝 Estructura de Datos

### NominaData

```typescript
interface NominaData {
  id?: string;
  period_start?: string;
  period_end?: string;
  employee?: {
    name?: string;
    dni?: string;
    nss?: string;
    category?: string;
  };
  company?: {
    name?: string;
    cif?: string;
    address?: string;
  };
  perceptions?: Array<{
    code?: string;
    concept?: string;
    amount?: number;
  }>;
  deductions?: Array<{
    code?: string;
    concept?: string;
    amount?: number;
  }>;
  contributions?: Array<{
    concept?: string;
    base?: number;
    rate?: number;
    employer_contribution?: number;
  }>;
  base_ss?: number;
  net_pay?: number;
  gross_salary?: number;
  cost_empresa?: number;
  document_name?: string;
  signed?: boolean;
}
```

## 🚨 Manejo de Errores

```typescript
try {
  const result = await processor.processDocument(pdfBuffer);
  
  if (!result.success) {
    console.error('Error procesando documento:', result.errors);
  }
} catch (error) {
  console.error('Error:', error.message);
}
```

## 🔒 Seguridad

- Las API keys se manejan de forma segura
- Los datos se procesan en servidor
- Soporte para configuración de peerDependencies
- Validación de tipos TypeScript

## 📚 Ejemplos Completos

### Integración con Express.js

```typescript
import express from 'express';
import multer from 'multer';
import { createNominaProcessor } from '@vacly/nominas-processor';

const app = express();
const upload = multer();
const processor = createNominaProcessor(config);

app.post('/process-nominas', upload.single('pdf'), async (req, res) => {
  try {
    const result = await processor.processDocument(req.file.buffer);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Integración con Next.js API Routes

```typescript
// pages/api/nominas/process.ts
import { createNominaProcessor } from '@vacly/nominas-processor';
import type { NextApiRequest, NextApiResponse } from 'next';

const processor = createNominaProcessor({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY!,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    try {
      const { fileBuffer } = req.body;
      const result = await processor.processDocument(Buffer.from(fileBuffer));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}
```

## 📄 Licencia

MIT

## 🤝 Soporte

Para soporte técnico, crear un issue en el repositorio o contactar al equipo de Vacly.

---

**Desarrollado con ❤️ por el equipo de Vacly** 