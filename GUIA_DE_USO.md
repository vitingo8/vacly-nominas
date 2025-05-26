# 📋 Guía de Uso - Sistema de Procesamiento de Nóminas con IA

## 🎯 ¿Qué hace esta aplicación?

Esta aplicación procesa documentos de nóminas en PDF utilizando inteligencia artificial para extraer y organizar automáticamente toda la información laboral. Puedes elegir entre **dos modos de procesamiento** según tus necesidades y presupuesto.

## ⚙️ **PASO 1: Configuración del Sistema de Procesamiento**

### 🔧 **Elige tu modo de procesamiento**

Antes de empezar, debes seleccionar el tipo de procesamiento que mejor se adapte a tus necesidades:

#### **🆓 Procesamiento Básico (GRATUITO)**
- ✅ **Qué incluye**: Procesamiento con Claude AI, extracción de datos, exportación a Excel
- ❌ **Limitaciones**: Sin memoria empresarial, cada documento se procesa desde cero
- ⏱️ **Tiempo**: 20-30 segundos por documento
- 💰 **Costo**: Solo el costo de Claude AI (sin costos adicionales)
- 🎯 **Ideal para**: Uso ocasional, menos de 50 nóminas al mes

#### **⭐ Memoria Empresarial (PREMIUM)**
- ✅ **Todo lo del básico +**: Sistema de memoria inteligente, búsqueda semántica, aprendizaje automático
- 🚀 **Ventajas**: Precisión mejorada (90-95%), procesamiento más rápido con el tiempo
- ⏱️ **Tiempo**: 5-10 segundos por documento (mejora con el uso)
- 💰 **Costo**: ~$0.10 por 1000 documentos procesados (muy económico)
- 🎯 **Ideal para**: Uso regular, más de 100 nóminas al mes, múltiples empresas

### 📊 **Cómo cambiar de modo**
- **Ubicación**: Panel superior de la aplicación "⚙️ Configuración del Sistema de Procesamiento"
- **Cambio**: Haz clic en la tarjeta del modo que prefieras
- **Efecto inmediato**: El cambio se aplica instantáneamente a todos los procesamientos futuros

## 🚀 Cómo usar la aplicación paso a paso

### 2. **Cargar documentos PDF**
   - **Acción**: Haz clic en "Seleccionar archivos" o arrastra tus PDFs a la zona de carga
   - **Qué acepta**: Archivos PDF de nóminas (pueden tener múltiples páginas)
   - **Resultado**: Cada página se convierte en un documento individual
   - **Visualización**: Verás una lista con todos los documentos separados

### 3. **Revisar documentos separados** 
   - **Panel izquierdo**: Lista de todos los documentos creados
   - **Cada documento muestra**:
     - 📄 Nombre del archivo original
     - 📑 Número de página
     - 👁️ Botón para ver contenido
     - 🧠 Botón para procesar con IA
   - **Acciones disponibles**:
     - **"Ver"**: Abre el visor para revisar el documento
     - **"Procesar"**: Envía el documento a la IA para extraer datos

### 4. **Procesar con Inteligencia Artificial**
   - **Acción**: Haz clic en el botón 🧠 "Procesar con IA"
   - **Qué sucede según tu modo**:
     
     **🆓 Modo Básico:**
     - Se analiza el texto de la nómina
     - Se extraen automáticamente todos los datos laborales
     - Se guarda la información en la base de datos
     - ⏱️ Tiempo: 20-30 segundos
     
     **⭐ Modo Memoria Empresarial:**
     - Se analiza el texto de la nómina
     - Se consulta la **memoria empresarial** para mejorar la precisión
     - Se extraen automáticamente todos los datos laborales
     - Se guarda la información en la base de datos
     - Se **actualiza la memoria** con nuevos patrones aprendidos
     - ⏱️ Tiempo: 5-10 segundos (mejora con el uso)
   
   - **Resultado**: Documento marcado como ✅ procesado

### 5. **Revisar información extraída**
   - **Panel derecho**: Muestra los datos procesados en formato organizado
   - **Información extraída**:
     - 👤 **Datos del empleado**: Nombre, DNI, número de afiliación, etc.
     - 🏢 **Datos de la empresa**: Nombre, CIF, dirección, etc.
     - 💰 **Percepciones**: Salario base, complementos, horas extra, etc.
     - 📉 **Deducciones**: IRPF, Seguridad Social, etc.
     - 🏦 **Datos bancarios**: IBAN, código SWIFT
     - 📅 **Período**: Fechas de inicio y fin del período de nómina

## 🧠 Sistema de Memoria Empresarial

### ¿Qué es la memoria empresarial?
La aplicación **aprende automáticamente** de cada documento procesado para mejorar la precisión en procesamientos futuros. Esto incluye:

- **Patrones de la empresa**: Estructura típica de nóminas, conceptos habituales
- **Información específica**: Códigos de percepciones y deducciones más frecuentes
- **Terminología**: Palabras clave relevantes para la empresa
- **Documentos similares**: Búsqueda semántica de nóminas parecidas ya procesadas

### Panel de memoria (parte inferior)
- **📊 Estado de la Memoria Empresarial**: Dashboard completo que muestra cómo el sistema aprende de tus documentos

#### 🔍 ¿Qué ves en el panel de memoria?

**1. Patrones Aprendidos** 🧠
- **Qué es**: La IA reconoce la estructura específica de las nóminas de tu empresa
- **Para qué sirve**: Cada vez que proceses una nómina similar, será más rápido y preciso
- **Precisión**: Porcentaje que indica qué tan bien conoce tu formato de nóminas

**2. Textos Indexados** 📚  
- **Qué es**: Fragmentos de texto guardados para buscar documentos similares
- **Para qué sirve**: Cuando llegue una nómina nueva, busca automáticamente otras parecidas ya procesadas
- **Ventaja**: Reutiliza conocimiento de documentos anteriores

**3. Documentos Procesados** 📋
- **Qué es**: Contador total de nóminas que has procesado exitosamente  
- **Para qué sirve**: Cada documento enseña algo nuevo al sistema
- **Resultado**: Más documentos = mejor rendimiento futuro

**4. Reutilización** ♻️
- **Qué es**: Cuántas veces el sistema ha usado patrones aprendidos anteriormente
- **Para qué sirve**: Indica que la memoria está funcionando y ahorrando tiempo
- **Beneficio**: Procesamientos más rápidos y consistentes

#### 🎯 Secciones del conocimiento empresarial

**Conocimiento de tu Empresa** 🧠
- **Patrones específicos**: Muestra qué ha aprendido de tus nóminas (estructura, términos, formatos)
- **Palabras clave**: Términos específicos que aparecen frecuentemente en tus documentos
- **Nivel de confianza**: Qué tan seguro está el sistema de cada patrón aprendido
- **Uso**: Cuántas veces se ha aplicado cada patrón

**Actividad Reciente** 📈  
- **Historial**: Últimos documentos procesados con su estado
- **Estados posibles**:
  - ✅ **Aprendido**: Procesado exitosamente, enseñó algo nuevo al sistema
  - ⏳ **Procesando**: Documento en análisis
  - ❌ **Error**: Hubo un problema, no se aprendió nada
- **Beneficio**: Ves el progreso del aprendizaje automático

## 📥 Exportación de datos

### Exportar a Excel
- **Acción**: Haz clic en "Exportar todo a Excel"
- **Qué incluye**:
  - **Hoja "Resumen"**: Vista general de todas las nóminas
  - **Hoja "Percepciones"**: Detalle de todos los ingresos
  - **Hoja "Deducciones"**: Detalle de todos los descuentos
- **Formato**: Archivo Excel (.xlsx) listo para contabilidad

### Procesar múltiples documentos
- **Acción**: Haz clic en "Procesar todo con IA"
- **Función**: Procesa automáticamente todos los documentos pendientes
- **Recomendación**: Ideal cuando tienes muchas nóminas del mismo período

## ⚠️ Mensajes del sistema

### Estados de los documentos:
- **🔄 Sin procesar**: Documento cargado pero no analizado
- **✅ Procesado**: Datos extraídos y guardados correctamente
- **❌ Error**: Problema durante el procesamiento
- **🧠 Procesando**: IA analizando el documento (espera unos segundos)

### Panel de memoria:
- **🟢 Memoria activa**: Sistema funcionando con IA avanzada
- **🔴 Sin memoria**: Solo procesamiento básico (falta configuración)
- **📊 Estadísticas**: Información sobre la base de conocimiento

## 🔧 Requisitos técnicos

Para que funcione completamente, la aplicación necesita:
- **✅ Voyage AI**: Para el sistema de memoria avanzada (obligatorio)
- **✅ Claude (Anthropic)**: Para el procesamiento de texto
- **✅ Supabase**: Para almacenar datos y memoria

## 💡 Consejos de uso

1. **Primera vez**: Los primeros documentos tardan más en procesarse, pero la precisión mejora rápidamente
2. **Documentos similares**: Nóminas de la misma empresa se procesan cada vez más rápido y precisas
3. **Revisión manual**: Siempre revisa los datos extraídos antes de usarlos en contabilidad
4. **Exportación regular**: Exporta a Excel periódicamente para tener backups
5. **Formato de PDFs**: Funciona mejor con PDFs de texto (no escaneados)

## 🆘 Solución de problemas

### Error "Voyage AI not configured"
- **Problema**: Falta la configuración de memoria avanzada
- **Solución**: Contacta con el administrador para configurar las variables de entorno

### Error "Failed to process nomina"
- **Causa común**: PDF con texto no legible o formato inusual
- **Solución**: Verifica que el PDF contiene texto seleccionable

### Memoria no funciona
- **Síntomas**: No se muestran estadísticas de memoria
- **Causa**: Configuración de variables de entorno incompleta
- **Estado**: Solo funcionará el procesamiento básico

---

## 📧 Soporte

Si tienes problemas o dudas sobre el uso de la aplicación, revisa los mensajes de error en pantalla o contacta con el equipo técnico.

**¡La aplicación mejora automáticamente cuanto más la uses!** 🚀 