import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  agente,
  prepararBase,
  postConToken,
  limpiarDatosDePrueba,
  MARCA_PRUEBA,
} from './helpers';

describe('Equipo C · Cabeceras, errores y diagnóstico', () => {
  before(async () => {
    await prepararBase();
  });

  after(async () => {
    await limpiarDatosDePrueba();
  });

  test('VUL-25: el sitio y la API envían cabeceras de seguridad (helmet y CSP)', async () => {
    for (const ruta of ['/', '/api/salud']) {
      const res = await agente().get(ruta);
      assert.equal(res.status, 200, `${ruta} respondió ${res.status}`);

      const csp = String(res.headers['content-security-policy'] ?? '');
      assert.match(csp, /default-src 'self'/);
      assert.match(csp, /script-src 'self'/);
      assert.match(csp, /object-src 'none'/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /img-src 'self' data:/);
      assert.doesNotMatch(csp, /upgrade-insecure-requests/);
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
    }
  });

  test('VUL-23: /api/_diagnostico exige sesión y no filtra secretos', async () => {
    const res = await agente().get('/api/_diagnostico');
    assert.equal(res.status, 401);
    assert.doesNotMatch(res.text, /DB_PASSWORD|SESSION_SECRET|entorno/i);
  });

  test('VUL-06 y VUL-24: una ruta inexistente devuelve 404 sin reflejar la URL ni incluir stack', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    const res = await agente().get(`/api/no-existe-${encodeURIComponent(payload)}`);

    assert.equal(res.status, 404);
    assert.equal(typeof res.body.error, 'string');
    assert.doesNotMatch(res.body.error, /<img|onerror|no-existe/i);
    assert.equal('stack' in res.body, false);
  });

  test('VUL-06: un producto inexistente devuelve 404 con mensaje fijo sin reflejar el id', async () => {
    const res = await agente().get('/api/productos/999999');

    assert.equal(res.status, 404);
    assert.equal(typeof res.body.error, 'string');
    assert.doesNotMatch(res.body.error, /999999/);
    assert.equal('stack' in res.body, false);
  });

  test('VUL-24: un error de la API no devuelve stack trace al cliente', async () => {
    const res = await postConToken(agente(), '/api/pedidos', {
      mesa: '1',
      cliente: MARCA_PRUEBA,
      items: [{ productoId: 999999, cantidad: 1 }],
    });

    assert.ok(res.status >= 400, `se esperaba error >= 400, respondió ${res.status}`);
    assert.equal(typeof res.body.error, 'string');
    assert.equal('stack' in res.body, false);
  });
});
