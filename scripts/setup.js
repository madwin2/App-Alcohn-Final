#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Configurando proyecto de Pedidos...\n');

// Verificar que estamos en el directorio correcto
if (!fs.existsSync('package.json')) {
  console.error('❌ Error: No se encontró package.json. Ejecuta este script desde la raíz del proyecto.');
  process.exit(1);
}

try {
  console.log('📦 Instalando dependencias...');
  execSync('npm install', { stdio: 'inherit' });
  
  console.log('\n✅ ¡Proyecto configurado correctamente!');
  console.log('\n📋 Comandos disponibles:');
  console.log('  npm run dev      - Ejecutar en modo desarrollo');
  console.log('  npm run build    - Construir para producción');
  console.log('  npm run lint     - Ejecutar linter');
  console.log('  npm run preview  - Vista previa de producción');
  
  console.log('\n🎯 Para empezar:');
  console.log('  npm run dev');
  console.log('  Abre http://localhost:5173 en tu navegador');
  
} catch (error) {
  console.error('❌ Error durante la configuración:', error.message);
  process.exit(1);
}
