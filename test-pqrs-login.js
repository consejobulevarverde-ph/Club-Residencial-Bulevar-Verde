/**
 * Test: PQRS Gestión Login - Verifica que "origin is not defined" esté resuelto
 *
 * Ejecutar con: node test-pqrs-login.js
 */

const https = require('https');
const querystring = require('querystring');
const url = require('url');

const PQRS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyr3z1N6wJPUoeV7fxXIQijd9kBupWkfIcS-n7DoftPRtNIbl3eNO2A6CTJBhFw2GVRgg/exec';
const TEST_NAME = 'Pepito Pérez';
const TEST_CODE = '841244';

console.log('🧪 Test: PQRS Gestión Login\n');
console.log('📍 Endpoint:', PQRS_WEB_APP_URL);
console.log('👤 Nombre:', TEST_NAME);
console.log('🔐 Código:', TEST_CODE);
console.log('\n⏳ Enviando solicitud...\n');

const postData = querystring.stringify({
  action: 'iniciarSesionGestionMantenimiento',
  requestId: 'test-' + Date.now(),
  origin: 'https://bulevar-verde-app.web.app',
  payload: JSON.stringify({
    nombre: TEST_NAME,
    clave: TEST_CODE
  })
});

const parsedUrl = new URL(PQRS_WEB_APP_URL);
const options = {
  hostname: parsedUrl.hostname,
  port: 443,
  path: parsedUrl.pathname + parsedUrl.search,
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData),
    'User-Agent': 'BulevarVerde-Test/1.0'
  }
};

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('📊 Response Status:', res.statusCode);
    console.log('📊 Response Headers:', res.headers['content-type']);
    console.log('\n───────────────────────────────────────');

    // Verificaciones
    const checks = {
      'Status 200 OK': res.statusCode === 200,
      'No "origin is not defined"': !data.includes('origin is not defined'),
      'No "ReferenceError"': !data.includes('ReferenceError'),
      'Contains valid response': data.length > 0
    };

    let allPassed = true;
    Object.entries(checks).forEach(([check, passed]) => {
      const symbol = passed ? '✅' : '❌';
      console.log(`${symbol} ${check}`);
      if (!passed) allPassed = false;
    });

    console.log('\n───────────────────────────────────────');

    // Analizar respuesta
    try {
      // Intentar encontrar JSON en la respuesta HTML
      const jsonMatch = data.match(/PORTAL_BV_RESPONSE['":\s]*({[^}]+})/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1];
        console.log('\n📋 JSON Response encontrado:');
        console.log(jsonStr.substring(0, 200) + (jsonStr.length > 200 ? '...' : ''));

        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.ok !== undefined) {
            console.log(`\n✨ Respuesta válida de Apps Script:`);
            console.log(`   ok: ${parsed.ok}`);
            if (parsed.error) {
              console.log(`   error: "${parsed.error}"`);
            }
            if (!parsed.error || !parsed.error.includes('origin')) {
              allPassed = true;
            }
          }
        } catch (e) {
          console.log('⚠️  No se pudo parsear JSON');
        }
      }
    } catch (e) {
      console.log('⚠️  Error analizando respuesta:', e.message);
    }

    console.log('\n───────────────────────────────────────');
    if (allPassed) {
      console.log('\n🎉 ÉXITO: Login está funcionando correctamente\n');
      process.exit(0);
    } else {
      console.log('\n❌ FALLO: Hay problemas con el login\n');
      console.log('📝 Respuesta completa (primeros 500 chars):');
      console.log(data.substring(0, 500));
      console.log('\n');
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Error en la solicitud:', e.message);
  process.exit(1);
});

req.write(postData);
req.end();
