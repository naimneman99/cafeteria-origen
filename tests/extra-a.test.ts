import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../src/db';
import * as usuarios from '../src/services/usuarios.service';
import {
  agente,
  prepararBase,
  postConToken,
  patchConToken,
  productoPorNombre,
  crearUsuarioDePrueba,
  limpiarDatosDePrueba,
  MARCA_PRUEBA,
} from './helpers';

const HASH_BCRYPT = /^\$2[aby]\$\d{2}\$/;

describe('Equipo A · Contraseñas', () => {
  before(async () => {
    await prepararBase();
  });

  after(async () => {
    await limpiarDatosDePrueba();
  });

  test('cambiar la contraseña guarda un hash bcrypt', async () => {
    const { id } = await crearUsuarioDePrueba('sec_hash', 'Sec_Clave_2024!');
    await usuarios.cambiarPassword(id!, 'Otra_Clave_2024!');

    const { rows } = await db.query('SELECT password FROM usuarios WHERE id = $1', [id]);
    assert.match(rows[0].password, HASH_BCRYPT);
    assert.ok(await usuarios.autenticar('sec_hash', 'Otra_Clave_2024!'));
  });

  test('actualizar con contraseña guarda un hash bcrypt', async () => {
    const { id } = await crearUsuarioDePrueba('sec_hash_upd', 'Sec_Clave_2024!');
    await usuarios.actualizar(id!, { password: 'Otra_Clave_2024!' });

    const { rows } = await db.query('SELECT password FROM usuarios WHERE id = $1', [id]);
    assert.match(rows[0].password, HASH_BCRYPT);
  });

  test('listar no devuelve la columna password', async () => {
    const lista = await usuarios.listar();
    assert.ok(lista.length > 0);
    for (const usuario of lista) {
      assert.equal('password' in usuario, false);
    }
  });

  test('las cuentas iniciales no aceptan contraseñas triviales', async () => {
    const triviales: [string, string][] = [
      ['admin', 'admin'],
      ['valentina', 'origen2024'],
      ['barista', 'cafe123'],
      ['mozo', 'mozo123'],
      ['cliente', 'cliente'],
    ];
    for (const [username, password] of triviales) {
      assert.equal(
        await usuarios.autenticar(username, password),
        null,
        `${username} sigue aceptando una contraseña trivial`
      );
    }
  });
});

describe('Equipo A · Validación de entrada', () => {
  let productoId: number;

  before(async () => {
    await prepararBase();
    productoId = (await productoPorNombre('Espresso Pocillo Colombia')).id;
  });

  after(async () => {
    await limpiarDatosDePrueba();
  });

  const pedido = (cambios: Record<string, unknown>) => ({
    mesa: '1',
    cliente: MARCA_PRUEBA,
    items: [{ productoId, cantidad: 1 }],
    ...cambios,
  });

  const reseña = (cambios: Record<string, unknown>) => ({
    autor: MARCA_PRUEBA,
    texto: 'Muy rico el café.',
    calificacion: 5,
    ...cambios,
  });

  test('un pedido válido se sigue creando', async () => {
    const res = await postConToken(agente(), '/api/pedidos', pedido({}));
    assert.equal(res.status, 201);
  });

  const pedidosInvalidos: [string, Record<string, unknown>][] = [
    ['cantidad cero', { items: [{ productoId: 0, cantidad: 0 }] }],
    ['cantidad decimal', { items: [{ productoId: 0, cantidad: 1.5 }] }],
    ['cantidad absurda', { items: [{ productoId: 0, cantidad: 999999 }] }],
    ['cantidad como texto numérico', { items: [{ productoId: 0, cantidad: '2' }] }],
    ['items ausente', { items: undefined }],
    ['items que no es una lista', { items: 'todo' }],
    ['lista de items vacía', { items: [] }],
    ['demasiados items', { items: Array.from({ length: 21 }, () => ({ productoId: 0, cantidad: 1 })) }],
    ['producto inexistente', { items: [{ productoId: 999999, cantidad: 1 }] }],
    ['productoId que no es entero', { items: [{ productoId: 'x', cantidad: 1 }] }],
    ['mesa vacía', { mesa: '' }],
    ['mesa demasiado larga', { mesa: '1'.repeat(11) }],
    ['mesa con caracteres raros', { mesa: "1' OR 1=1" }],
    ['cliente demasiado corto', { cliente: 'A' }],
    ['cliente demasiado largo', { cliente: 'A'.repeat(41) }],
    ['cliente que no es texto', { cliente: { $ne: null } }],
  ];

  for (const [caso, cambios] of pedidosInvalidos) {
    test(`un pedido con ${caso} se rechaza con 400`, async () => {
      // productoId: 0 es un marcador: se reemplaza por un producto real.
      const cuerpo: Record<string, unknown> = pedido(cambios);
      if (Array.isArray(cuerpo.items)) {
        cuerpo.items = cuerpo.items.map((i: Record<string, unknown>) =>
          i.productoId === 0 ? { ...i, productoId } : i
        );
      }
      const res = await postConToken(agente(), '/api/pedidos', cuerpo);
      assert.equal(res.status, 400, `respondió ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(typeof res.body.error, 'string');
    });
  }

  test('el estado de un pedido solo acepta valores de la lista blanca', async () => {
    const creado = await postConToken(agente(), '/api/pedidos', pedido({}));
    const res = await patchConToken(agente(), `/api/pedidos/${creado.body.id}/estado`, {
      estado: 'pagado-por-la-casa',
    });
    assert.equal(res.status, 400);
  });

  test('un id de pedido que no es entero se rechaza con 400', async () => {
    const res = await agente().get('/api/pedidos/1abc');
    assert.equal(res.status, 400);
  });

  test('una reseña válida se sigue creando', async () => {
    const res = await postConToken(agente(), '/api/comentarios', reseña({}));
    assert.equal(res.status, 201);
  });

  const reseñasInvalidas: [string, Record<string, unknown>][] = [
    ['texto demasiado largo', { texto: 'A'.repeat(281) }],
    ['texto demasiado corto', { texto: 'ok' }],
    ['texto ausente', { texto: undefined }],
    ['autor demasiado corto', { autor: 'A' }],
    ['autor demasiado largo', { autor: 'A'.repeat(41) }],
    ['calificación cero', { calificacion: 0 }],
    ['calificación seis', { calificacion: 6 }],
    ['calificación decimal', { calificacion: 4.5 }],
    ['calificación como texto', { calificacion: 'cinco' }],
  ];

  for (const [caso, cambios] of reseñasInvalidas) {
    test(`una reseña con ${caso} se rechaza con 400`, async () => {
      const res = await postConToken(agente(), '/api/comentarios', reseña(cambios));
      assert.equal(res.status, 400, `respondió ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(typeof res.body.error, 'string');
    });
  }
});
