import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { sesiones } from '../src/middleware/sesion';
import {
  app,
  prepararBase,
  crearUsuarioDePrueba,
  limpiarDatosDePrueba,
  cookieCruda,
} from './helpers';

function extraerSid(res: request.Response): string | null {
  const match = /sid=([^;]+)/.exec(cookieCruda(res));
  return match ? match[1] : null;
}

describe('Equipo B · Sesiones seguras (VUL-17)', () => {
  before(async () => {
    await prepararBase();
  });

  after(async () => {
    await limpiarDatosDePrueba();
  });

  test('una sesión vencida devuelve 401 en /api/auth/yo y se elimina del almacén', async () => {
    const { res: loginRes } = await crearUsuarioDePrueba('sec_exp_vencida', 'Sec_Clave_2024!', 'barista');
    assert.equal(loginRes.status, 200);

    const sid = extraerSid(loginRes);
    assert.ok(sid, 'No se recibió la cookie sid tras el login');

    const sesionActual = sesiones.get(sid);
    assert.ok(sesionActual, 'La sesión debería existir en el mapa sesiones');

    // Forzamos la expiración en el pasado
    sesionActual.expiraEn = Date.now() - 10_000;
    sesiones.set(sid, sesionActual);

    const resYo = await request(app).get('/api/auth/yo').set('Cookie', `sid=${sid}`);
    assert.equal(resYo.status, 401, 'Una sesión vencida debería devolver 401');
    assert.equal(sesiones.has(sid), false, 'La sesión vencida debería eliminarse de sesiones');
  });

  test('una sesión vigente devuelve 200 en /api/auth/yo', async () => {
    const { res: loginRes } = await crearUsuarioDePrueba('sec_exp_vigente', 'Sec_Clave_2024!', 'barista');
    assert.equal(loginRes.status, 200);

    const sid = extraerSid(loginRes);
    assert.ok(sid, 'No se recibió la cookie sid tras el login');

    const resYo = await request(app).get('/api/auth/yo').set('Cookie', `sid=${sid}`);
    assert.equal(resYo.status, 200, 'Una sesión vigente debería devolver 200');
  });
});

describe('Equipo B · Login endurecido (VUL-14, VUL-18, VUL-19, VUL-06)', () => {
  before(async () => {
    await prepararBase();
  });

  after(async () => {
    await limpiarDatosDePrueba();
  });

  test('el logout invalida la sesión en el servidor y rechaza la cookie previa (VUL-18)', async () => {
    const { res: loginRes } = await crearUsuarioDePrueba('sec_logout_user', 'Sec_Clave_2024!', 'barista');
    assert.equal(loginRes.status, 200);

    const sid = extraerSid(loginRes);
    assert.ok(sid, 'No se recibió la cookie sid tras el login');

    const resLogout = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `sid=${sid}`);
    assert.equal(resLogout.status, 200);
    assert.equal(sesiones.has(sid), false, 'La sesión debe eliminarse del mapa sesiones al cerrar sesión');

    const resYo = await request(app)
      .get('/api/auth/yo')
      .set('Cookie', `sid=${sid}`);
    assert.equal(resYo.status, 401, 'La cookie previa no debe seguir sirviendo después del logout');
  });

  test('los mensajes de error del login son genéricos y no reflejan HTML (VUL-19 y VUL-06)', async () => {
    await crearUsuarioDePrueba('sec_enum_user', 'Sec_Clave_2024!', 'barista');

    const resClaveMala = await request(app)
      .post('/api/auth/login')
      .send({ username: 'sec_enum_user', password: 'ClaveIncorrecta_999!' });

    const payloadXss = '<script>alert("xss")</script>';
    const resUsuarioInexistente = await request(app)
      .post('/api/auth/login')
      .send({ username: payloadXss, password: 'ClaveIncorrecta_999!' });

    assert.equal(resClaveMala.status, 401);
    assert.equal(resUsuarioInexistente.status, 401);
    assert.equal(
      resClaveMala.body.error,
      resUsuarioInexistente.body.error,
      'El mensaje de error debe ser idéntico para usuario inexistente y clave incorrecta'
    );
    assert.equal(
      resUsuarioInexistente.body.error.includes('<script>'),
      false,
      'El error del login no debe reflejar HTML sin escapar'
    );
  });

  test('bloquea intentos reiterados de login fallidos con 429 (VUL-14)', async () => {
    // Hacemos hasta 8 intentos fallidos; debe bloquear antes de 10 (límite configurado en 5)
    let ultimoStatus = 0;
    for (let i = 0; i < 8; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'sec_fuerza_bruta', password: `Intento_${i}` });
      ultimoStatus = res.status;
      if (ultimoStatus === 429) break;
    }

    assert.equal(ultimoStatus, 429, 'Debe devolver 429 Too Many Requests ante fuerza bruta');
  });
});