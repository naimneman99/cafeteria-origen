/**
 * Protección anti-CSRF mediante double-submit cookie y validación de origen (VUL-09).
 *
 * - GET /api/csrf-token emite un token aleatorio de 32 bytes (64 hex) en la
 *   cookie `csrf_token` (HttpOnly, SameSite=Lax) y lo devuelve en JSON.
 * - Las peticiones que modifican estado (POST, PUT, PATCH, DELETE) deben
 *   provenir del mismo origen (si envían Origin o Referer) y adjuntar el token
 *   en la cabecera `X-CSRF-Token`, en `req.body._csrf` o en `req.query._csrf`.
 */

import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

import config from '../config';
import { leerCookies } from './sesion';

const NOMBRE_COOKIE_CSRF = 'csrf_token';
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);
const FORMATO_TOKEN = /^[a-f0-9]{64}$/i;

function compararConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function origenValido(req: Request): boolean {
  const host = req.headers.host;
  if (!host) return true;

  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.length > 0) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const referer = req.headers.referer;
  if (typeof referer === 'string' && referer.length > 0) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }

  return true;
}

function extraerTokenPeticion(req: Request): string {
  const header = req.get('x-csrf-token');
  if (typeof header === 'string' && header.trim()) return header.trim();

  if (req.body && typeof req.body === 'object' && typeof req.body._csrf === 'string') {
    return req.body._csrf.trim();
  }

  if (typeof req.query._csrf === 'string' && req.query._csrf.trim()) {
    return req.query._csrf.trim();
  }

  return '';
}

/** Emite o reutiliza el token anti-CSRF de la sesión del navegador. */
export function emitirTokenCsrf(req: Request, res: Response): void {
  const cookies = leerCookies(req);
  let token = cookies[NOMBRE_COOKIE_CSRF];

  if (!token || !FORMATO_TOKEN.test(token)) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(NOMBRE_COOKIE_CSRF, token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }

  res.json({ csrfToken: token, token });
}

/** Valida origen y token anti-CSRF en peticiones que modifican estado. */
export function validarCsrf(req: Request, res: Response, next: NextFunction): void {
  if (METODOS_SEGUROS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  if (!origenValido(req)) {
    res.status(403).json({ error: 'Origen de petición no permitido.' });
    return;
  }

  const cookies = leerCookies(req);
  const tokenCookie = cookies[NOMBRE_COOKIE_CSRF] || '';
  const tokenPeticion = extraerTokenPeticion(req);

  if (!FORMATO_TOKEN.test(tokenCookie) || !compararConstante(tokenCookie, tokenPeticion)) {
    res.status(403).json({ error: 'Token CSRF inválido o ausente.' });
    return;
  }

  if (req.body && typeof req.body === 'object' && '_csrf' in req.body) {
    delete req.body._csrf;
  }

  next();
}
