/**
 * Validación de entrada en el servidor.
 *
 * El cuerpo de una petición llega como `any`: los tipos de TypeScript no lo
 * controlan en ejecución y la validación del HTML se saltea con el devtools.
 * Cada función comprueba tipo, longitud o rango contra una lista blanca y
 * devuelve el valor ya limpio, o lanza un ErrorValidacion (HTTP 400).
 */

import type { ErrorHttp } from './tipos';

/** Mayor id posible: las columnas `id` de la base son INTEGER de PostgreSQL. */
export const MAX_ID = 2_147_483_647;

export class ErrorValidacion extends Error implements ErrorHttp {
  status = 400;
}

/** Texto de `min` a `max` caracteres (sin contar espacios de los bordes). */
export function texto(valor: unknown, campo: string, min: number, max: number, formato?: RegExp): string {
  if (typeof valor !== 'string') {
    throw new ErrorValidacion(`El campo ${campo} tiene que ser un texto.`);
  }
  const limpio = valor.trim();
  if (limpio.length < min || limpio.length > max) {
    throw new ErrorValidacion(`El campo ${campo} tiene que tener entre ${min} y ${max} caracteres.`);
  }
  if (formato && !formato.test(limpio)) {
    throw new ErrorValidacion(`El campo ${campo} tiene caracteres no permitidos.`);
  }
  return limpio;
}

/** Número entero entre `min` y `max`. No convierte textos: "2" se rechaza. */
export function entero(valor: unknown, campo: string, min: number, max: number): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor)) {
    throw new ErrorValidacion(`El campo ${campo} tiene que ser un número entero.`);
  }
  if (valor < min || valor > max) {
    throw new ErrorValidacion(`El campo ${campo} tiene que estar entre ${min} y ${max}.`);
  }
  return valor;
}

/** Id positivo que llega como texto en la URL ("12", no "12abc" ni "1e3"). */
export function idDeRuta(valor: unknown, campo = 'id'): number {
  if (typeof valor !== 'string' || !/^\d{1,9}$/.test(valor)) {
    throw new ErrorValidacion(`El ${campo} tiene que ser un número entero.`);
  }
  return entero(Number(valor), campo, 1, MAX_ID);
}

/** Lista de `min` a `max` elementos. */
export function lista(valor: unknown, campo: string, min: number, max: number): unknown[] {
  if (!Array.isArray(valor)) {
    throw new ErrorValidacion(`El campo ${campo} tiene que ser una lista.`);
  }
  if (valor.length < min || valor.length > max) {
    throw new ErrorValidacion(`El campo ${campo} tiene que tener entre ${min} y ${max} elementos.`);
  }
  return valor;
}

/** Uno de los valores permitidos (lista blanca). */
export function unoDe<T extends string>(valor: unknown, campo: string, permitidos: readonly T[]): T {
  if (!permitidos.includes(valor as T)) {
    throw new ErrorValidacion(`El campo ${campo} tiene que ser uno de: ${permitidos.join(', ')}.`);
  }
  return valor as T;
}

/** Objeto plano (para los elementos de una lista, como los items de un pedido). */
export function objeto(valor: unknown, campo: string): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new ErrorValidacion(`El campo ${campo} tiene que ser un objeto.`);
  }
  return valor as Record<string, unknown>;
}
