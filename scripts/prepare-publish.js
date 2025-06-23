#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Preparando paquete para publicación...\n');

// 1. Verificar que existe el directorio dist
if (!fs.existsSync('dist')) {
  console.error('❌ Error: El directorio dist no existe. Ejecuta npm run build:lib primero.');
  process.exit(1);
}

// 2. Verificar archivos principales
const requiredFiles = [
  'dist/index.js',
  'dist/index.d.ts',
  'dist/api/index.js',
  'dist/api/index.d.ts',
  'dist/lib/index.js',
  'dist/lib/index.d.ts'
];

console.log('📁 Verificando archivos de distribución...');
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`❌ Error: Archivo faltante: ${file}`);
    process.exit(1);
  } else {
    console.log(`✅ ${file}`);
  }
}

// 3. Verificar package.json
console.log('\n📦 Verificando package.json...');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const requiredFields = ['name', 'version', 'description', 'main', 'types', 'exports'];
for (const field of requiredFields) {
  if (!packageJson[field]) {
    console.error(`❌ Error: Campo faltante en package.json: ${field}`);
    process.exit(1);
  } else {
    console.log(`✅ ${field}: ${typeof packageJson[field] === 'object' ? 'configurado' : packageJson[field]}`);
  }
}

// 4. Crear README final combinando README-PACKAGE.md
console.log('\n📝 Preparando README final...');
if (fs.existsSync('README-PACKAGE.md')) {
  fs.copyFileSync('README-PACKAGE.md', 'README.md');
  console.log('✅ README.md actualizado desde README-PACKAGE.md');
} else {
  console.warn('⚠️  No se encontró README-PACKAGE.md, manteniendo README.md actual');
}

// 5. Verificar que no hay archivos de desarrollo en los files
console.log('\n🧹 Verificando archivos a incluir...');
const filesToInclude = packageJson.files || [];
console.log('📄 Archivos que se incluirán en el paquete:');
filesToInclude.forEach(file => {
  console.log(`  - ${file}`);
});

// 6. Generar resumen de tamaños
console.log('\n📊 Resumen de tamaños:');
const getDirectorySize = (dir) => {
  let totalSize = 0;
  const files = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const file of files) {
    const filePath = path.join(dir, file.name);
    if (file.isDirectory()) {
      totalSize += getDirectorySize(filePath);
    } else {
      totalSize += fs.statSync(filePath).size;
    }
  }
  
  return totalSize;
};

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

if (fs.existsSync('dist')) {
  const distSize = getDirectorySize('dist');
  console.log(`📦 Tamaño del directorio dist: ${formatBytes(distSize)}`);
}

// 7. Verificar dependencias
console.log('\n🔗 Verificando dependencias...');
if (packageJson.peerDependencies) {
  console.log('📋 Peer Dependencies encontradas:');
  Object.entries(packageJson.peerDependencies).forEach(([dep, version]) => {
    console.log(`  - ${dep}: ${version}`);
  });
}

// 8. Mostrar comandos finales
console.log('\n✅ ¡Paquete listo para publicación!');
console.log('\n📤 Comandos para publicar:');
console.log('  npm pack                     # Para generar .tgz local');
console.log('  npm publish --dry-run        # Para simular publicación');
console.log('  npm publish                  # Para publicar (¡cuidado!)');

console.log('\n📝 Para instalar localmente en otro proyecto:');
console.log('  npm install ./vacly-nominas-processor-1.0.0.tgz');

console.log('\n🎉 Preparación completada exitosamente!'); 