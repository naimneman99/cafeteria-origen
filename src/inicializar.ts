import * as db from './db';
import { CATALOGO } from './catalogo';
import bcrypt from 'bcryptjs';
import { COSTO_BCRYPT } from './services/usuarios.service';
import type { Rol } from './tipos';

interface UsuarioInicial {
  username: string;
  /** Variable de entorno con la contraseña (ver .env.example). */
  variable: string;
  rol: Rol;
  nombre: string;
}

/**
 * Carga los datos iniciales (usuarios y catálogo) si la base está vacía.
 * Las contraseñas de las cuentas iniciales salen de variables de entorno (no
 * hay credenciales de fábrica en el código) y se guardan como hash bcrypt.
 * Si falta la variable de una cuenta, esa cuenta no se crea.
 */

export const USUARIOS_INICIALES: UsuarioInicial[] = [
  {
    username: 'admin',
    variable: 'ADMIN_PASSWORD',
    rol: 'admin',
    nombre: 'Administración',
  },
  {
    username: 'valentina',
    variable: 'VALENTINA_PASSWORD',
    rol: 'admin',
    nombre: 'Valentina',
  },
  {
    username: 'barista',
    variable: 'BARISTA_PASSWORD',
    rol: 'barista',
    nombre: 'Barista',
  },
  {
    username: 'mozo',
    variable: 'MOZO_PASSWORD',
    rol: 'mozo',
    nombre: 'Mozo de sala',
  },
  {
    username: 'cliente',
    variable: 'CLIENTE_PASSWORD',
    rol: 'cliente',
    nombre: 'Cliente',
  },
];

export async function inicializarBase(): Promise<void> {
  // --- Usuarios -------------------------------------------------------------
  for (const usuario of USUARIOS_INICIALES) {
    const password = process.env[usuario.variable];
    if (!password) {
      console.warn(`[origen] ${usuario.variable} no está definida: no se crea el usuario ${usuario.username}`);
      continue;
    }

    // Solo se hashea si el usuario no existe: bcrypt es lento a propósito.
    const { rows } = await db.query('SELECT 1 FROM usuarios WHERE username = $1', [usuario.username]);
    if (rows.length > 0) continue;

    await db.query(
      `INSERT INTO usuarios (username, password, rol, nombre)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING`,
      [usuario.username, await bcrypt.hash(password, COSTO_BCRYPT), usuario.rol, usuario.nombre]
    );
  }

  // Las filas que quedaron en texto plano de versiones anteriores se hashean
  // sin tener que borrar el volumen de la base. Las cuentas iniciales toman la
  // contraseña del entorno, así no conservan la credencial de fábrica.
  const { rows: enClaro } = await db.query<{ id: number; username: string; password: string }>(
    "SELECT id, username, password FROM usuarios WHERE password NOT LIKE '$2_$%'"
  );
  for (const fila of enClaro) {
    const inicial = USUARIOS_INICIALES.find((u) => u.username === fila.username);
    const password = (inicial && process.env[inicial.variable]) || fila.password;
    await db.query('UPDATE usuarios SET password = $1 WHERE id = $2', [
      await bcrypt.hash(password, COSTO_BCRYPT),
      fila.id,
    ]);
  }

  // --- Catálogo -------------------------------------------------------------
  for (const producto of CATALOGO) {
    await db.query(
      `INSERT INTO productos
         (nombre, tipo, variedad, tamano, gramos, precio_base, precio_por_gramo, descripcion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (nombre) DO NOTHING`,
      [
        producto.nombre,
        producto.tipo,
        producto.variedad,
        producto.tamano,
        producto.gramos,
        producto.precio_base,
        producto.precio_por_gramo,
        producto.descripcion,
      ]
    );
  }
}
