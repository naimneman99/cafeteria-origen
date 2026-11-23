import * as db from '../db';
import { calcularPrecio } from '../catalogo';
import { ErrorValidacion, MAX_ID, entero, lista, objeto, texto, unoDe } from '../validacion';
import type { Pedido, PedidoConItems, PedidoItem, Producto } from '../tipos';

/** Un renglón del pedido, tal como llega en el cuerpo de la petición. */
export interface ItemPedido {
  productoId: number;
  cantidad: number;
}

/** Pedido nuevo, tal como llega en el cuerpo de la petición. */
export interface NuevoPedido {
  mesa: string;
  cliente: string;
  items: ItemPedido[];
}

/** Id tal como llega en la URL (texto) o ya convertido. */
type Id = number | string;

/** Estados por los que pasa un pedido (lista blanca). */
export const ESTADOS_PERMITIDOS = ['abierto', 'preparando', 'listo', 'entregado'] as const;
export type EstadoPedido = (typeof ESTADOS_PERMITIDOS)[number];

/** Límites de un pedido: los mismos que el formulario, más un tope de abuso. */
const MAX_ITEMS = 20;
const MAX_CANTIDAD = 20;
const FORMATO_MESA = /^[A-Za-z0-9 -]+$/;

/**
 * Servicio de pedidos.
 *
 * El cuerpo de la petición llega como `any`: los tipos de `NuevoPedido` no lo
 * controlan en ejecución, así que cada campo se valida acá, en el servidor.
 */

/**
 * Crea un pedido a partir de una lista de items { productoId, cantidad }.
 * Total = suma de calcularPrecio(producto) x cantidad
 */
export async function crear(pedido: NuevoPedido): Promise<PedidoConItems | null> {
  const { mesa, cliente, items } = validarPedido(pedido);

  const filas: { productoId: number; cantidad: number; precioUnitario: number }[] = [];
  for (const item of items) {
    const producto = await buscarProducto(item.productoId);
    if (!producto) {
      throw new ErrorValidacion(`El producto ${item.productoId} no existe.`);
    }
    filas.push({
      productoId: producto.id,
      cantidad: item.cantidad,
      precioUnitario: calcularPrecio(producto),
    });
  }

  const total = filas.reduce(
    (acc, f) => acc + f.precioUnitario * f.cantidad,
    0
  );

  const { rows } = await db.query<Pedido>(
    `INSERT INTO pedidos (mesa, cliente, estado, total)
     VALUES ($1, $2, 'abierto', $3)
     RETURNING *`,
    [mesa, cliente, total]
  );
  const creado = rows[0];

  for (const fila of filas) {
    await db.query(
      `INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
       VALUES ($1, $2, $3, $4)`,
      [creado.id, fila.productoId, fila.cantidad, fila.precioUnitario]
    );
  }

  return obtenerConItems(creado.id);
}

/** Valida tipo, longitud y rango de cada campo del pedido. */
function validarPedido(pedido: NuevoPedido): NuevoPedido {
  const items = lista(pedido.items, 'items', 1, MAX_ITEMS).map((valor, i) => {
    const item = objeto(valor, `items[${i}]`);
    return {
      productoId: entero(item.productoId, `items[${i}].productoId`, 1, MAX_ID),
      cantidad: entero(item.cantidad, `items[${i}].cantidad`, 1, MAX_CANTIDAD),
    };
  });
  return {
    mesa: texto(pedido.mesa, 'mesa', 1, 10, FORMATO_MESA),
    cliente: texto(pedido.cliente, 'cliente', 2, 40),
    items,
  };
}

/** Busca un producto por id (helper interno). */
async function buscarProducto(productoId: number): Promise<Producto | undefined> {
  const { rows } = await db.query<Producto>('SELECT * FROM productos WHERE id = $1', [productoId]);
  return rows[0];
}

/** Lista pedidos (con filtro opcional por mesa). */
export async function listar(mesa?: string): Promise<Pedido[]> {
  const { rows } = mesa
    ? await db.query<Pedido>('SELECT * FROM pedidos WHERE mesa = $1 ORDER BY id DESC', [mesa])
    : await db.query<Pedido>('SELECT * FROM pedidos ORDER BY id DESC');
  return rows;
}

/** Devuelve un pedido con sus items. */
export async function obtenerConItems(id: Id): Promise<PedidoConItems | null> {
  const { rows: pedidos } = await db.query<Pedido>(
    'SELECT * FROM pedidos WHERE id = $1',
    [id]
  );
  const pedido = pedidos[0];
  if (!pedido) return null;

  const { rows: items } = await db.query<PedidoItem>(
    `SELECT pi.*, pr.nombre AS producto_nombre
       FROM pedido_items pi
       JOIN productos pr ON pr.id = pi.producto_id
      WHERE pi.pedido_id = $1`,
    [id]
  );

  return { ...pedido, items };
}

/** Cambia el estado de un pedido. */
export async function cambiarEstado(id: Id, estado: unknown): Promise<Pedido | null> {
  unoDe(estado, 'estado', ESTADOS_PERMITIDOS);
  const { rows } = await db.query<Pedido>(
    'UPDATE pedidos SET estado = $1 WHERE id = $2 RETURNING *',
    [estado, id]
  );
  return rows[0] || null;
}
