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