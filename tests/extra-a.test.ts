import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../src/db';
import * as usuarios from '../src/services/usuarios.service';
import { prepararBase, crearUsuarioDePrueba, limpiarDatosDePrueba } from './helpers';

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
