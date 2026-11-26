import bcrypt from 'bcryptjs';
import * as db from '../db';
import type { Usuario } from '../tipos';

/**
 * Servicio de usuarios.
 *
 * Todas las consultas son parametrizadas ($1, $2, ...): la entrada del usuario
 * viaja separada del texto SQL y el motor nunca la interpreta como código.
 *
 * Las contraseñas se guardan como hash bcrypt (con salt propio por usuario) y
 * se verifican con bcrypt.compare. Nunca se devuelven fuera de este servicio.
 */

/** Usuario sin la columna password. */
export type UsuarioPublico = Omit<Usuario, 'password'>;

export const COSTO_BCRYPT = 12;

/** Hash contra el que se compara cuando el usuario no existe. */
const HASH_DE_RELLENO = bcrypt.hashSync('usuario-inexistente', COSTO_BCRYPT);

export function hashear(password: string): Promise<string> {
  return bcrypt.hash(password, COSTO_BCRYPT);
}

/** Busca un usuario por nombre de usuario exacto (query parametrizada). */
export async function buscarPorUsername(username: string): Promise<Usuario | null> {
  const { rows } = await db.query<Usuario>(
    'SELECT * FROM usuarios WHERE username = $1',
    [username]
  );
  return rows[0] || null;
}

/**
 * Autentica a un usuario comparando usuario y contraseña.
 * Devuelve el usuario o null.
 *
 * Si el usuario no existe se compara igual contra un hash de relleno, para que
 * el tiempo de respuesta no revele qué cuentas existen.
 */
export async function autenticar(username: string, password: string): Promise<Usuario | null> {
  if (typeof username !== 'string' || typeof password !== 'string') return null;

  const usuario = await buscarPorUsername(username);
  const coincide = await bcrypt.compare(password, usuario ? usuario.password : HASH_DE_RELLENO);
  return usuario && coincide ? usuario : null;
}

/** Lista todos los usuarios (para el panel de administración). */
export async function listar(): Promise<UsuarioPublico[]> {
  const { rows } = await db.query<UsuarioPublico>(
    `SELECT id, username, rol, nombre, creado_en FROM usuarios ORDER BY id`
  );
  return rows;
}

/**
 * Actualiza un usuario. Si llega una contraseña, se guarda su hash.
 * Solo la llama PUT /api/admin/usuarios/:id, que exige rol admin.
 */
export async function actualizar(
  id: number | string,
  cambios: Partial<Usuario>
): Promise<UsuarioPublico | null> {
  if (cambios.password !== undefined) {
    cambios = { ...cambios, password: await hashear(cambios.password) };
  }

  const campos: string[] = [];
  const valores: unknown[] = [];
  let i = 1;
  for (const [campo, valor] of Object.entries(cambios)) {
    campos.push(`${campo} = $${i}`);
    valores.push(valor);
    i += 1;
  }
  if (campos.length === 0) return null;
  valores.push(id);
  const { rows } = await db.query<UsuarioPublico>(
    `UPDATE usuarios SET ${campos.join(', ')} WHERE id = $${i} RETURNING id, username, rol, nombre, creado_en`,
    valores
  );
  return rows[0] || null;
}

/** Cambia la contraseña de un usuario (se guarda su hash). */
export async function cambiarPassword(id: number, nuevaPassword: string): Promise<UsuarioPublico | null> {
  const { rows } = await db.query<UsuarioPublico>(
    `UPDATE usuarios SET password = $1 WHERE id = $2 RETURNING id, username, rol, nombre, creado_en`,
    [await hashear(nuevaPassword), id]
  );
  return rows[0] || null;
}
