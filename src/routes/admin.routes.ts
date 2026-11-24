import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { exec, spawn } from 'child_process';

import config from '../config';
import * as catalogo from '../services/catalogo.service';
import * as usuarios from '../services/usuarios.service';
import { requiereSesion, requiereRol } from '../middleware/auth';
import type { Rol, Usuario } from '../tipos';

const router = express.Router();

const ROLES_VALIDOS: Rol[] = ['admin', 'cliente'];

// CORRECCIÓN (VUL-22): lista blanca de hosts permitidos y patrón estricto sin operadores de shell.
const HOSTS_PERMITIDOS = new Set([
  'localhost',
  '127.0.0.1',
  'db',
  'postgres',
  'example.com',
]);
const PATRON_HOST_SEGURO = /^[a-zA-Z0-9.-]{1,253}$/;

// CORRECCIÓN (VUL-12): lista blanca de extensiones de imagen y límite de tamaño (2 MB).
const EXTENSIONES_PERMITIDAS: Record<string, string[]> = {
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.webp': ['image/webp'],
};
const MAX_BYTES_ARCHIVO = 2 * 1024 * 1024;

function detectarTipoImagen(buf: Buffer): string | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Rutas del panel de administración.
 *
 * -----------------------------------------------------------------------------
 * FALLA — Autorización ausente / escalada de privilegios (OWASP A01:2021)
 * -----------------------------------------------------------------------------
 * Se exige estar autenticado, pero NO se comprueba el rol: `requiereRol` está
 * importado y no se usa. Cualquier usuario autenticado (incluso con rol
 * "cliente") entra al panel y puede:
 *   - crear, editar y BORRAR productos,
 *   - cambiar contraseñas,
 *   - dar de alta usuarios y cambiarles el rol (escalada de privilegios),
 *   - ejecutar comandos en el servidor.
 *
 * Corrección: `router.use(requiereRol('admin'))` sobre las rutas sensibles.
 * -----------------------------------------------------------------------------
 */
// CORRECCIÓN (VUL-20): se exige sesión válida y rol 'admin' para las rutas de administración.
router.use(requiereSesion, requiereRol('admin'));

/** GET /api/admin/usuarios */
router.get('/usuarios', async (req, res, next) => {
  try {
    res.json({ usuarios: await usuarios.listar() });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/usuarios/:id
 *
 * FALLA — Asignación masiva: se actualiza cualquier campo que llegue en el
 * cuerpo, incluido el `rol`. Un usuario con rol "cliente" puede mandarse
 * `{"rol": "admin"}` y convertirse en administrador.
 */
router.put('/usuarios/:id', async (req, res, next) => {
  try {
    const { username, nombre, rol, password } = req.body || {};
    const cambios: Partial<Usuario> = {};
    if (username !== undefined) cambios.username = username;
    if (nombre !== undefined) cambios.nombre = nombre;
    if (rol !== undefined) {
      // CORRECCIÓN (VUL-21): además de exigir rol admin, se valida que el rol sea permitido.
      if (typeof rol !== 'string' || !ROLES_VALIDOS.includes(rol as Rol)) {
        return res.status(400).json({ error: 'Rol inválido.' });
      }
      cambios.rol = rol as Rol;
    }
    if (password !== undefined) cambios.password = password;

    const usuario = await usuarios.actualizar(req.params.id, cambios);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json(usuario);
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/productos — alta de producto. */
router.post('/productos', async (req, res, next) => {
  try {
    const producto = await catalogo.crear(req.body || {});
    res.status(201).json(producto);
  } catch (err) {
    // El nombre del producto es único en la base.
    if ((err as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'Ya existe un producto con ese nombre.' });
    }
    next(err);
  }
});

/** PUT /api/admin/productos/:id */
router.put('/productos/:id', async (req, res, next) => {
  try {
    const producto = await catalogo.actualizar(req.params.id, req.body || {});
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    res.json(producto);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/productos/:id
 *
 * FALLA — CSRF: la petición que borra un producto no lleva ningún token y se
 * acepta con un simple GET/POST desde cualquier origen.
 */
router.delete('/productos/:id', async (req, res, next) => {
  try {
    const producto = await catalogo.eliminar(req.params.id);
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    res.json(producto);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/cambiar-contrasena
 *
 * FALLAS: sin token anti-CSRF, sin límite de intentos, y la contraseña nueva
 * se guarda en texto plano.
 */
router.post('/cambiar-contrasena', async (req, res, next) => {
  try {
    const { nueva } = req.body || {};
    if (!nueva) {
      return res.status(400).json({ error: 'Falta la contraseña nueva.' });
    }
    // FALLA: no se valida la longitud ni la complejidad de la contraseña.
    // (`req.usuario!`: requiereSesion ya garantizó que hay un usuario.)
    const usuario = await usuarios.cambiarPassword(req.usuario!.id, nueva);
    res.json({ mensaje: 'Contraseña actualizada.', usuario });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/probar-conexion
 *
 * -----------------------------------------------------------------------------
 * FALLA — Inyección de comandos del sistema operativo (OWASP A03:2021)
 * -----------------------------------------------------------------------------
 * La dirección del proveedor se mete dentro de una cadena de shell.
 * Como `exec` launches /bin/sh -c, los operadores del shell (|, ;, &&, $())
 * se interpretan y permiten ejecutar comandos arbitrarios en el contenedor.
 *
 * Corrección: validar el host contra una LISTA BLANCA y ejecutar el proceso
 * con `spawn('ping', ['-c', '3', host], { shell: false })`, sin pasar por el
 * shell.
 * -----------------------------------------------------------------------------
 */
router.post('/probar-conexion', (req, res) => {
  const { host } = req.body || {};

  // CORRECCIÓN (VUL-22): se valida el host contra lista blanca y patrón estricto,
  // y se ejecuta `ping` con argumentos separados y `shell: false` (sin `exec` ni shell).
  if (
    typeof host !== 'string' ||
    !PATRON_HOST_SEGURO.test(host) ||
    !HOSTS_PERMITIDOS.has(host)
  ) {
    return res.status(400).json({ error: 'Host no permitido.' });
  }

  const comandoMostrado = `ping -c 3 ${host}`;
  const child = spawn('ping', ['-c', '3', host], { shell: false });

  let stdout = '';
  let stderr = '';
  let respondido = false;

  const timer = setTimeout(() => {
    if (!respondido) {
      respondido = true;
      child.kill('SIGKILL');
      res.json({
        comando: comandoMostrado,
        salida: stdout,
        error: stderr || 'Tiempo de espera agotado.',
      });
    }
  }, 5000);

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('error', (err) => {
    clearTimeout(timer);
    if (!respondido) {
      respondido = true;
      res.json({
        comando: comandoMostrado,
        salida: stdout,
        error: stderr || err.message,
      });
    }
  });

  child.on('close', (code) => {
    clearTimeout(timer);
    if (!respondido) {
      respondido = true;
      res.json({
        comando: comandoMostrado,
        salida: stdout,
        error: stderr || (code !== 0 && code !== null ? `Código de salida ${code}` : null),
      });
    }
  });
});

/**
 * POST /api/admin/subir-archivo
 *
 * -----------------------------------------------------------------------------
 * FALLA — Carga de archivos sin restricciones (OWASP A04:2021)
 * -----------------------------------------------------------------------------
 * No se valida la extensión, el tipo MIME ni el tamaño del archivo, y se
 * guarda con el nombre que manda el cliente (además sin sanitizar "../", lo
 * que permite escribir fuera de la carpeta de subidas). Los archivos subidos
 * se sirven con express.static desde el mismo origen.
 *
 * Corrección: validar extensión contra lista blanca (.png/.jpg/.svg saneado),
 * verificar el tipo MIME real, limitar el tamaño, generar un nombre aleatorio
 * y guardar fuera del árbol web.
 * -----------------------------------------------------------------------------
 */
router.post('/subir-archivo', express.json({ limit: '8mb' }), (req, res, next) => {
  try {
    const { nombre, contenidoBase64 } = req.body || {};

    if (
      typeof nombre !== 'string' ||
      typeof contenidoBase64 !== 'string' ||
      !nombre ||
      !contenidoBase64
    ) {
      return res.status(400).json({ error: 'Falta el archivo.' });
    }

    // CORRECCIÓN (VUL-12): sanear nombre base, validar extensión y tamaño, verificar
    // tipo real por firma de bytes y guardar con nombre aleatorio dentro de uploadsDir.
    const nombreBase = path.basename(nombre);
    const ext = path.extname(nombreBase).toLowerCase();
    const mimesPermitidos = EXTENSIONES_PERMITIDAS[ext];

    if (!mimesPermitidos) {
      return res.status(400).json({ error: 'Tipo de archivo no permitido.' });
    }

    const buffer = Buffer.from(contenidoBase64, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_BYTES_ARCHIVO) {
      return res.status(400).json({ error: 'Tamaño de archivo inválido.' });
    }

    const tipoReal = detectarTipoImagen(buffer);
    if (!tipoReal || !mimesPermitidos.includes(tipoReal)) {
      return res.status(400).json({ error: 'El contenido del archivo no coincide con una imagen válida.' });
    }

    const carpetaBase = path.resolve(config.uploadsDir);
    fs.mkdirSync(carpetaBase, { recursive: true });

    const nombreSeguro = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    const destino = path.resolve(carpetaBase, nombreSeguro);

    if (!destino.startsWith(carpetaBase + path.sep)) {
      return res.status(400).json({ error: 'Ruta de destino inválida.' });
    }

    fs.writeFileSync(destino, buffer);

    res.json({
      mensaje: 'Archivo subido.',
      url: `/uploads/${nombreSeguro}`,
      bytes: buffer.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;