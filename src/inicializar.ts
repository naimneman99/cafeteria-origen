import * as db from './db';
import { CATALOGO } from './catalogo';
import { hashear } from './services/usuarios.service';
import type { Rol } from './tipos';

interface UsuarioInicial {
  username: string;
  password: string;
  rol: Rol;
  nombre: string;
}

/**
 * Carga los datos iniciales (usuarios y catálogo) si la base está vacía.
 * Las contraseñas se guardan como hash bcrypt.
 */

export const USUARIOS_INICIALES: UsuarioInicial[] = [
  {
    username: 'admin',
    password: 'admin',
    rol: 'admin',
    nombre: 'Administración',
  },
  {
    username: 'valentina',
    password: 'origen2024',
    rol: 'admin',
    nombre: 'Valentina',
  },
  {
    username: 'barista',
    password: 'cafe123',
    rol: 'barista',
    nombre: 'Barista',
  },
  {
    username: 'mozo',
    password: 'mozo123',
    rol: 'mozo',
    nombre: 'Mozo de sala',
  },
  {
    username: 'cliente',
    password: 'cliente',
    rol: 'cliente',
    nombre: 'Cliente',
  },
];

export async function inicializarBase(): Promise<void> {
  // --- Usuarios -------------------------------------------------------------
  for (const usuario of USUARIOS_INICIALES) {
    // Solo se hashea si el usuario no existe: bcrypt es lento a propósito.
    const { rows } = await db.query('SELECT 1 FROM usuarios WHERE username = $1', [usuario.username]);
    if (rows.length > 0) continue;

    await db.query(
      `INSERT INTO usuarios (username, password, rol, nombre)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING`,
      [usuario.username, await hashear(usuario.password), usuario.rol, usuario.nombre]
    );
  }

  // Las filas que quedaron en texto plano de versiones anteriores se hashean
  // con su misma contraseña, sin tener que borrar el volumen de la base.
  const { rows: enClaro } = await db.query<{ id: number; password: string }>(
    "SELECT id, password FROM usuarios WHERE password NOT LIKE '$2_$%'"
  );
  for (const fila of enClaro) {
    await db.query('UPDATE usuarios SET password = $1 WHERE id = $2', [
      await hashear(fila.password),
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
