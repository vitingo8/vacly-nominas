# Convención de Nombres de Archivos - Vacly Nóminas

## 📋 Resumen

El sistema ahora utiliza una convención de nombres inteligente que extrae automáticamente información de las nóminas para generar nombres descriptivos y organizados.

## 🎯 Formatos de Nombres

### 📄 Archivo Global (PDF Original)
**Formato**: `YYYYMM_Empresa.pdf`

**Ejemplos**:
- `202401_Construcciones García SL.pdf`
- `202312_Tecnología Avanzada SA.pdf`
- `202403_Servicios Integrales López.pdf`

### 📑 Archivos Split (Páginas Individuales)
**Formato**: `YYYYMM_Nombre Trabajador.pdf`

**Ejemplos**:
- `202401_Juan García Martínez.pdf`
- `202401_María López Fernández.pdf`
- `202312_Carlos Rodríguez Sánchez.pdf`

### 📝 Archivos de Texto
**Formato**: `YYYYMM_Nombre Trabajador.txt`

**Ejemplos**:
- `202401_Juan García Martínez.txt`
- `202401_María López Fernández.txt`

## 🔍 Extracción Automática

El sistema utiliza IA (Claude) para extraer automáticamente información **de cada página individual**:

1. **Nombre de la Empresa**: Busca términos como "empresa", "razón social", "entidad"
2. **Nombre del Empleado**: Busca "empleado", "trabajador", "nombre"
3. **Período**: Extrae fechas en formatos como "enero 2024", "01/2024", "2024-01"

> **⚠️ Importante**: Cada página se analiza por separado, permitiendo que un mismo PDF contenga nóminas de diferentes empleados, períodos o incluso empresas.

## 🛡️ Características de Seguridad

- **Sanitización**: Los nombres se limpian de caracteres especiales
- **Límite de longitud**: Máximo 50 caracteres por nombre
- **Fallback**: Si no se puede extraer información, usa valores por defecto
- **Duplicados**: Maneja automáticamente archivos con nombres duplicados
- **Procesamiento individual**: Cada página mantiene su propia identidad

## 🔄 Proceso de Naming

1. **Upload**: Se extrae información básica del PDF completo para el archivo global
2. **División**: El PDF se divide en páginas individuales
3. **Análisis individual**: Claude procesa cada página por separado
4. **Extracción específica**: Se identifica empresa, empleado y período de cada página
5. **Generación**: Se crean nombres únicos para cada archivo split
6. **Validación**: Se verifican y sanitizan los nombres
7. **Almacenamiento**: Se guardan con los nuevos nombres específicos

## 📊 Beneficios

- ✅ **Organización automática** por período y empresa
- ✅ **Identificación rápida** de empleados y empresas
- ✅ **Compatibilidad** con sistemas de archivos
- ✅ **Búsqueda eficiente** por nombre o período
- ✅ **Escalabilidad** para grandes volúmenes
- ✅ **Flexibilidad** para PDFs con múltiples empleados
- ✅ **Precisión individual** por página

## 🔧 Configuración Técnica

### Archivos Involucrados
- `src/lib/pdf-naming.ts` - Lógica de extracción y generación de nombres
- `src/app/api/upload/route.ts` - Naming para archivos globales
- `src/app/api/process*/route.ts` - Naming para archivos split

### Funciones Principales
- `extractBasicNominaInfo()` - Extrae información con IA
- `generateGlobalFileName()` - Genera nombre del archivo global
- `generateSplitFileName()` - Genera nombres de archivos split
- `sanitizeFileName()` - Limpia nombres para uso seguro

## 🚨 Casos Especiales

### Información No Disponible
Si no se puede extraer información:
- **Empresa**: "Desconocido"
- **Empleado**: "Desconocido" 
- **Período**: Mes/año actual (ej: "202401")

### Caracteres Especiales
Se eliminan o reemplazan automáticamente:
- `García & López S.L.` → `García López SL`
- `Empleado/Contratado` → `Empleado Contratado`

## 📈 Ejemplos de Uso

### Antes (Sistema Anterior)
```
uuid123_nomina.pdf
uuid123_nomina_page_1.pdf
uuid123_nomina_page_2.pdf
```

### Después (Nuevo Sistema)

#### PDF con múltiples empleados:
**Archivo Global:**
```
202401_Construcciones García SL.pdf
```

**Archivos Split (cada página analizada individualmente):**
```
202401_Juan García Martínez.pdf
202401_María López Fernández.pdf
202401_Carlos Rodríguez Sánchez.pdf
202312_Ana Martín Torres.pdf      # Diferente período
202401_Luis Fernández García.pdf
```

> **Nota**: Observe cómo la página 4 tiene un período diferente (202312) porque el sistema detectó que esa nómina específica corresponde a diciembre 2023, mientras que las otras son de enero 2024.

#### PDF con un solo empleado:
```
202308_CAMBRA OFC COMER IND SERVEI.pdf           # Archivo global
202308_ESPUNY CABALLE DAVID.pdf                  # Una sola página por empleado
```

#### PDF con múltiples empleados del mismo mes:
```
202401_Construcciones García SL.pdf              # Archivo global
202401_Juan García Martínez.pdf                  # Empleado 1
202401_María López Fernández.pdf                 # Empleado 2  
202401_Carlos Rodríguez Sánchez.pdf              # Empleado 3
202401_Ana Martín Torres.pdf                     # Empleado 4
202401_Luis Fernández García.pdf                 # Empleado 5
```

> **Nota**: Cada empleado tiene una única nómina por mes, por lo que no hay duplicados. El sistema identifica automáticamente el empleado y período de cada página.

## 🎉 Resultado

El nuevo sistema proporciona una organización automática y inteligente que facilita la gestión y búsqueda de documentos de nóminas, mejorando significativamente la experiencia del usuario. 