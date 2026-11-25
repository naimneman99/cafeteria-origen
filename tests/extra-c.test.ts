import fs from 'fs';
import path from 'path';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  agente,
  prepararBase,
  postConToken,
  tokenCsrf,
  productoPorNombre,
  limpiarDatosDePrueba,
  MARCA_PRUEBA,} from './helpers';

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

describe('Equipo C · XSS en el cliente (VUL-05, VUL-07, VUL-08)', () => {
  const dirJs = path.join(__dirname, '..', 'src', 'public', 'js');

  test('VUL-05 y VUL-07: app.js y admin.js no usan innerHTML ni la función insegura raw()', () => {
    for (const archivo of ['app.js', 'admin.js']) {
      const codigo = fs.readFileSync(path.join(dirJs, archivo), 'utf8');
      assert.doesNotMatch(codigo, /\binnerHTML\b/, `${archivo} todavía contiene innerHTML`);
      assert.doesNotMatch(codigo, /\bfunction\s+raw\s*\(/, `${archivo} todavía define raw()`);
    }
  });

  test('VUL-08: admin.js valida el parámetro vista contra una lista blanca y usa textContent', () => {
    const codigo = fs.readFileSync(path.join(dirJs, 'admin.js'), 'utf8');
    assert.match(codigo, /VISTAS_PERMITIDAS/, 'admin.js debe validar vista contra una lista blanca');
    assert.match(codigo, /#panel-bienvenida['"]\)\.textContent\s*=/);
  });
  describe('Equipo C · Protección anti-CSRF (VUL-09)', () => {
  let productoId: number;

  before(async () => {
    await prepararBase();
    productoId = (await productoPorNombre('Espresso Pocillo Colombia')).id;
  });

  after(async () => {
    await limpiarDatosDePrueba();
  });

  test('VUL-09: GET /api/csrf-token emite un token aleatorio y cookie csrf_token segura', async () => {
    const ag1 = agente();
    const ag2 = agente();

    const res1 = await ag1.get('/api/csrf-token');
    const res2 = await ag2.get('/api/csrf-token');

    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);
    assert.match(String(res1.body.csrfToken ?? ''), /^[a-f0-9]{64}$/i);
    assert.notEqual(res1.body.csrfToken, res2.body.csrfToken);

    const cookies = (res1.headers['set-cookie'] as unknown as string[] | undefined) || [];
    const cookieCsrf = cookies.find((c) => c.startsWith('csrf_token=')) || '';
    assert.ok(cookieCsrf, 'debe setear la cookie csrf_token');
    assert.match(cookieCsrf, /HttpOnly/i);
    assert.match(cookieCsrf, /SameSite=Lax/i);
  });

  test('VUL-09: POST sin token CSRF se rechaza con 403', async () => {
    const res = await agente().post('/api/comentarios').send({
      autor: MARCA_PRUEBA,
      texto: 'Intento sin token CSRF.',
      calificacion: 5,
    });
    assert.equal(res.status, 403);
  });

  test('VUL-09: POST con token CSRF que no coincide con la cookie se rechaza con 403', async () => {
    const ag = agente();
    await ag.get('/api/csrf-token');

    const res = await ag
      .post('/api/comentarios')
      .set('X-CSRF-Token', '0'.repeat(64))
      .send({
        autor: MARCA_PRUEBA,
        texto: 'Intento con token falso.',
        calificacion: 5,
      });
    assert.equal(res.status, 403);
  });

  test('VUL-09: POST desde un Origin distinto se rechaza con 403 aunque tenga token válido', async () => {
    const ag = agente();
    const token = await tokenCsrf(ag);
    assert.ok(token);

    const res = await ag
      .post('/api/comentarios')
      .set('Origin', 'https://atacante.ejemplo')
      .set('X-CSRF-Token', token)
      .send({
        autor: MARCA_PRUEBA,
        texto: 'Intento cross-origin.',
        calificacion: 5,
      });
    assert.equal(res.status, 403);
  });

  test('VUL-09: POST con cabecera X-CSRF-Token válida funciona normalmente', async () => {
    const ag = agente();
    const token = await tokenCsrf(ag);
    assert.ok(token);

    const res = await ag
      .post('/api/pedidos')
      .set('X-CSRF-Token', token)
      .send({
        mesa: '1',
        cliente: MARCA_PRUEBA,
        items: [{ productoId, cantidad: 1 }],
      });
    assert.equal(res.status, 201);
  });
});
});
