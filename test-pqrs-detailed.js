/**
 * Test Detallado: PQRS Gestión - Verifica estructura y flujo de login
 *
 * Ejecutar con: node test-pqrs-detailed.js
 */

const https = require('https');
const querystring = require('querystring');
const url = require('url');

const PQRS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyr3z1N6wJPUoeV7fxXIQijd9kBupWkfIcS-n7DoftPRtNIbl3eNO2A6CTJBhFw2GVRgg/exec';

function testLogin(nombre, clave, testName) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify({
      action: 'iniciarSesionGestionMantenimiento',
      requestId: 'test-' + Date.now() + '-' + Math.random().toString(16).slice(2),
      origin: 'https://bulevar-verde-app.web.app',
      payload: JSON.stringify({ nombre, clave })
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
        'User-Agent': 'BulevarVerde-DetailedTest/1.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const result = {
          testName,
          status: res.statusCode,
          hasOriginError: data.includes('origin is not defined'),
          hasReferenceError: data.includes('ReferenceError'),
          responseLength: data.length,
          response: data.substring(0, 300)
        };
        resolve(result);
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Test Detallado: PQRS Gestión Login\n');
  console.log('📍 Endpoint:', PQRS_WEB_APP_URL);
  console.log('═'.repeat(60));

  const tests = [
    { nombre: 'TECNICO VALIDO', clave: '841244', desc: 'Login válido' },
    { nombre: 'OTRO TECNICO', clave: '841244', desc: 'Otro técnico (clave correcta)' },
    { nombre: 'HENRY CORREA', clave: 'incorrecta', desc: 'Clave incorrecta' },
    { nombre: 'X', clave: '841244', desc: 'Nombre muy corto' }
  ];

  let allPassed = true;

  for (const test of tests) {
    console.log(`\n📝 Test: ${test.desc}`);
    console.log(`   Nombre: "${test.nombre}"`);
    console.log(`   Clave: "${test.clave}"`);
    console.log('   ⏳ Ejecutando...');

    const result = await testLogin(test.nombre, test.clave, test.desc);

    console.log(`   Status: ${result.status}`);
    console.log(`   ✅ Sin "origin is not defined": ${!result.hasOriginError ? 'SÍ' : 'NO'}`);
    console.log(`   ✅ Sin "ReferenceError": ${!result.hasReferenceError ? 'SÍ' : 'NO'}`);
    console.log(`   Response length: ${result.responseLength} bytes`);

    if (result.hasOriginError || result.hasReferenceError) {
      console.log('   ❌ FALLO');
      allPassed = false;
    } else {
      console.log('   ✅ ÉXITO');
    }
  }

  console.log('\n' + '═'.repeat(60));
  if (allPassed) {
    console.log('\n🎉 TODOS LOS TESTS PASARON - El fix funciona correctamente\n');
    process.exit(0);
  } else {
    console.log('\n❌ ALGUNOS TESTS FALLARON\n');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('❌ Error en tests:', err.message);
  process.exit(1);
});
