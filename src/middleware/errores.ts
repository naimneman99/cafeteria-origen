/**
 * Manejo de errores (VUL-24 y VUL-06).
 *
 * - Para errores de validación o cliente (status < 500) devuelve el mensaje
 *   controlado sin reflejar entrada del usuario ni incluir stack traces.
 * - Para errores internos (status >= 500) registra el detalle completo en el
 *   log del servidor y responde un mensaje genérico al cliente.
 */

import type { NextFunction, Request, Response } from 'express';

import type { ErrorHttp } from '../tipos';

export function rutaNoEncontrada(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Ruta no encontrada.' });
}

// Express reconoce al manejador de errores por sus CUATRO parámetros: `_next`
// tiene que estar aunque no se use.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function manejadorErrores(err: ErrorHttp, _req: Request, res: Response, _next: NextFunction): void {
  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  console.error('[error]', err.stack || err.message);

  if (status < 500) {
    res.status(status).json({ error: err.message || 'Solicitud inválida.' });
    return;
  }

  res.status(500).json({ error: 'Error interno del servidor.' });
}
