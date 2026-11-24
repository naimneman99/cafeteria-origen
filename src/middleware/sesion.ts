/**
 * Gestión de sesiones.
 *
 * -----------------------------------------------------------------------------
 * FALLA — Gestión de sesiones insegura (Autenticación insegura)
 * -----------------------------------------------------------------------------
 * 1. El identificador de sesión es un contador incremental (`sesion_1`,
 *    `sesion_2`, ...): es PREDECIBLE y adivinable. Un atacante puede recorrer
 *    los valores y usurpar la sesión de otro usuario (fijación de sesión).
 * 2. La cookie se emite SIN `httpOnly` (JavaScript puede leerla), SIN `secure`
 *    (viaja en texto plano por HTTP) y SIN `sameSite` (el navegador la manda
 *    también en peticiones desde otros sitios → facilita CSRF).
 * 3. Las sesiones NO expiran nunca.
 * 4. Al iniciar sesión no se regenera el identificador.
 * 5. El cierre de sesión sólo borra la cookie del cliente: la sesión sigue
 *    viva en el servidor.
 *
 * Corrección: usar crypto.randomUUID() (o crypto.randomBytes -> hex) para el
 * id, con expiración por inactividad y absoluta, cookie con
 * { httpOnly: true, secure: true, sameSite: 'lax' }, regeneración del id tras
 * el login y borrado de la sesión en el servidor al hacer logout.
 * -----------------------------------------------------------------------------
 */

import crypto from 'crypto';
import type { Request, Response } from 'express';

import config from '../config';
import type { Sesion, UsuarioSesion } from '../tipos';

const DURACION_MAXIMA_MS = 2 * 60 * 60 * 1000; // 2 horas (expiración absoluta)
const INACTIVIDAD_MAXIMA_MS = 30 * 60 * 1000; // 30 minutos (expiración por inactividad)

export const sesiones = new Map<string, Sesion>();

/** Lee las cookies de la petición (parser mínimo, sin dependencias). */
export function leerCookies(req: Request): Record<string, string> {
  const cookies: Record<string, string> = {};
  const header = req.headers.cookie;
  if (!header) return cookies;
  for (const parte of header.split(';')) {
    const separador = parte.indexOf('=');
    if (separador < 0) continue;
    const nombre = parte.slice(0, separador).trim();
    const valor = parte.slice(separador + 1).trim();
    if (nombre) cookies[nombre] = decodeURIComponent(valor);
  }
  return cookies;
}

/** Crea una sesión nueva para el usuario y setea la cookie. */
export function crearSesion(_req: Request, res: Response, usuario: UsuarioSesion): string {
  const id = crypto.randomBytes(32).toString('hex');
  const ahora = Date.now();
  const expiraEn = ahora + DURACION_MAXIMA_MS;

  sesiones.set(id, {
    usuario,
    creadaEn: ahora,
    expiraEn,
    ultimaActividadEn: ahora,
  });

  res.cookie('sid', id, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: DURACION_MAXIMA_MS,
    path: '/',
  });

  return id;
}

/** Devuelve la sesión de la petición si existe y no está vencida. */
export function obtenerSesion(req: Request): Sesion | null {
  const cookies = leerCookies(req);
  const id = cookies.sid;
  if (!id) return null;

  const sesion = sesiones.get(id);
  if (!sesion) return null;

  const ahora = Date.now();
  const vencidaPorTiempoAbsoluto = sesion.expiraEn !== null && ahora >= sesion.expiraEn;
  const ultimaActividad = sesion.ultimaActividadEn ?? sesion.creadaEn;
  const vencidaPorInactividad = ahora - ultimaActividad >= INACTIVIDAD_MAXIMA_MS;

  if (vencidaPorTiempoAbsoluto || vencidaPorInactividad) {
    sesiones.delete(id);
    return null;
  }

  sesion.ultimaActividadEn = ahora;
  return sesion;
}

/** Cierra la sesión en el servidor. */
export function destruirSesion(req: Request): void {
  const cookies = leerCookies(req);
  const id = cookies.sid;
  if (id) sesiones.delete(id);
}