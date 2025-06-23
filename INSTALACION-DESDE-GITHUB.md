# 📦 Instalación de @vacly/nominas-processor desde GitHub

## ✅ Métodos de Instalación Probados

### 1. Instalación desde Tag (Recomendado)
```bash
npm install "git+https://github.com/vitingo8/vacly-nominas.git#v1.0.1"
```

### 2. Instalación desde Rama Principal
```bash
npm install "git+https://github.com/vitingo8/vacly-nominas.git"
```

### 3. Método Alternativo con SSH (si tienes acceso SSH)
```bash
npm install "git+ssh://git@github.com/vitingo8/vacly-nominas.git#v1.0.1"
```

## 🔧 Resolución de Problemas Comunes

### Error EPERM (Permisos en Windows)
Si obtienes errores de permisos:
1. Ejecuta CMD/PowerShell como Administrador
2. O usa:
   ```bash
   npm install "git+https://github.com/vitingo8/vacly-nominas.git#v1.0.1" --no-optional
   ```

### TypeScript no reconoce el módulo
Añade en tu `tsconfig.json`:
```json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true
  }
}
```

### Instalación en Aplicación Next.js
```bash
cd tu-aplicacion
npm install "git+https://github.com/vitingo8/vacly-nominas.git#v1.0.1"
```

## 📋 Verificación de Instalación

Después de instalar, verifica que funciona:

```javascript
// test-nominas.js
import { createNominaProcessor } from '@vacly/nominas-processor';

console.log('✅ Paquete instalado correctamente');
console.log('Funciones disponibles:', Object.keys(createNominaProcessor));
```

```bash
node test-nominas.js
```

## 🚀 Uso Básico Después de Instalación

```javascript
import { createNominaProcessor } from '@vacly/nominas-processor';
import { getNominas } from '@vacly/nominas-processor/api';

// Crear procesador
const processor = createNominaProcessor({
  supabaseUrl: 'tu-url',
  supabaseKey: 'tu-key',
  anthropicApiKey: 'tu-key'
});

// Usar APIs
const nominas = await getNominas({
  supabaseUrl: 'tu-url',
  supabaseKey: 'tu-key'
});
```

## 📊 Versiones Disponibles

- `v1.0.0` - Versión inicial
- `v1.0.1` - Archivos dist/ incluidos, sin postinstall ✅ (Recomendada)

## 🆘 Soporte

Si tienes problemas:
1. Verifica que tienes acceso al repositorio GitHub
2. Usa la versión con tag específico: `#v1.0.1`
3. Ejecuta como administrador si estás en Windows
4. Revisa que tu proyecto tenga las peerDependencies instaladas 