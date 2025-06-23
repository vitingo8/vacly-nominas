# 📖 Ejemplo de Uso: @vacly/nominas-processor

## 🚀 Instalación en tu proyecto

```bash
# En tu aplicación principal
npm install @vacly/nominas-processor
```

## 📋 Configuración de Variables de Entorno

Crea un archivo `.env` en tu proyecto:

```env
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_KEY=your-service-key
ANTHROPIC_API_KEY=your-anthropic-key
VOYAGE_API_KEY=your-voyage-key  # opcional
```

## 💻 Uso Básico

### 1. Configuración Simple

```javascript
// En tu aplicación Next.js, Express, etc.
import { createNominaProcessor } from '@vacly/nominas-processor';

const processor = createNominaProcessor({
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  voyageApiKey: process.env.VOYAGE_API_KEY
});
```

### 2. Extraer Información de PDF

```javascript
import fs from 'fs';

// Desde archivo
const pdfBuffer = fs.readFileSync('nomina.pdf');
const basicInfo = await processor.extractBasicInfo(pdfBuffer);

console.log(basicInfo);
// Output: { companyName: "Mi Empresa SL", employeeName: "Juan García", period: "202401" }
```

### 3. Extraer Información de Texto

```javascript
// Si ya tienes texto extraído
const textContent = "Texto de la nómina...";
const basicInfo = await processor.extractBasicInfo(textContent);
```

### 4. Generar Nombres de Archivo

```javascript
// Para generar nombres consistentes
const filename = processor.generateFileName("Juan García", "202401", 1);
console.log(filename); // "202401_Juan García.pdf"
```

## 🔍 Uso Avanzado con API

### 1. Consultar Nóminas

```javascript
import { getNominas, searchNominas } from '@vacly/nominas-processor/api';

const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY
};

// Obtener todas las nóminas
const allNominas = await getNominas(config, {
  limit: 10,
  offset: 0
});

if (allNominas.success) {
  console.log('Nóminas encontradas:', allNominas.data.length);
}

// Buscar nóminas específicas
const results = await searchNominas(config, {
  employeeName: 'Juan',
  period: '202401'
});
```

### 2. Procesar Archivos

```javascript
import { processNominaFile } from '@vacly/nominas-processor/api';

const pdfBuffer = fs.readFileSync('nominas.pdf');
const result = await processNominaFile(pdfBuffer, config);

if (result.success) {
  console.log('Documentos procesados:', result.data.documents.length);
}
```

## 🖥️ Integración con Next.js

### API Route Example

```javascript
// pages/api/nominas/upload.js
import { createNominaProcessor } from '@vacly/nominas-processor';
import multer from 'multer';

const processor = createNominaProcessor({
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY
});

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      // Aquí recibirías el archivo desde el frontend
      const fileBuffer = req.body.fileBuffer;
      
      // Procesar
      const basicInfo = await processor.extractBasicInfo(fileBuffer);
      
      res.json({
        success: true,
        data: basicInfo
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}
```

### Frontend Component

```javascript
// components/NominaUploader.jsx
import { useState } from 'react';

export default function NominaUploader() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    
    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const response = await fetch('/api/nominas/upload', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input 
        type="file" 
        accept=".pdf"
        onChange={handleFileUpload}
        disabled={loading}
      />
      
      {loading && <p>Procesando...</p>}
      
      {result && (
        <div>
          <h3>Información Extraída:</h3>
          <p>Empresa: {result.data.companyName}</p>
          <p>Empleado: {result.data.employeeName}</p>
          <p>Período: {result.data.period}</p>
        </div>
      )}
    </div>
  );
}
```

## 🔧 Integración con Express.js

```javascript
// server.js
import express from 'express';
import multer from 'multer';
import { createNominaProcessor, getNominas } from '@vacly/nominas-processor';

const app = express();
const upload = multer();

const processor = createNominaProcessor({
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY
});

// Ruta para procesar PDFs
app.post('/api/process-nomina', upload.single('pdf'), async (req, res) => {
  try {
    const basicInfo = await processor.extractBasicInfo(req.file.buffer);
    res.json({ success: true, data: basicInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ruta para consultar nóminas
app.get('/api/nominas', async (req, res) => {
  try {
    const { limit, offset, companyId } = req.query;
    
    const result = await getNominas({
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY
    }, {
      limit: parseInt(limit) || 10,
      offset: parseInt(offset) || 0,
      companyId
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(3001, () => {
  console.log('Servidor corriendo en puerto 3001');
});
```

## 📊 Uso con TypeScript

```typescript
import { 
  createNominaProcessor, 
  type VaclyConfig, 
  type BasicNominaInfo, 
  type ProcessingResult 
} from '@vacly/nominas-processor';

const config: VaclyConfig = {
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY!,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!
};

const processor = createNominaProcessor(config);

// Con tipado fuerte
const processFile = async (buffer: Buffer): Promise<BasicNominaInfo> => {
  return await processor.extractBasicInfo(buffer);
};
```

## 🚨 Manejo de Errores

```javascript
try {
  const result = await processor.extractBasicInfo(pdfBuffer);
  
  // Verificar resultado
  if (result.companyName === 'Desconocido') {
    console.warn('No se pudo extraer el nombre de la empresa');
  }
  
} catch (error) {
  if (error.message.includes('Anthropic API key')) {
    console.error('Configuración de API key incorrecta');
  } else if (error.message.includes('Invalid response')) {
    console.error('Error en la respuesta de Claude');
  } else {
    console.error('Error general:', error.message);
  }
}
```

## 🔒 Mejores Prácticas

### 1. Validación de Entrada

```javascript
const validatePdfBuffer = (buffer) => {
  if (!buffer || buffer.length === 0) {
    throw new Error('Buffer vacío o inválido');
  }
  
  if (buffer.length > 10 * 1024 * 1024) { // 10MB
    throw new Error('Archivo demasiado grande');
  }
  
  return true;
};
```

### 2. Rate Limiting

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // máximo 100 requests por ventana
});

app.use('/api/nominas', limiter);
```

### 3. Caching

```javascript
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 600 }); // 10 minutos

const getCachedNominas = async (cacheKey, options) => {
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  
  const result = await getNominas(config, options);
  cache.set(cacheKey, result);
  
  return result;
};
```

## 📈 Monitoreo y Logs

```javascript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'nominas.log' })
  ]
});

// Usar en tus rutas
app.post('/api/process', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const result = await processor.extractBasicInfo(req.file.buffer);
    
    logger.info({
      action: 'process_nomina',
      duration: Date.now() - startTime,
      success: true,
      fileSize: req.file.buffer.length
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({
      action: 'process_nomina',
      duration: Date.now() - startTime,
      success: false,
      error: error.message
    });
    
    res.status(500).json({ success: false, error: error.message });
  }
});
```

---

¡Con estos ejemplos ya puedes integrar fácilmente **@vacly/nominas-processor** en tu aplicación!

Para más información, consulta el README del paquete o contacta al equipo de Vacly. 