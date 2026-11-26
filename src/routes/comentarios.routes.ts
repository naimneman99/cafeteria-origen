import express from 'express';
import * as comentarios from '../services/comentarios.service';

const router = express.Router();

/**
 * GET /api/comentarios — reseñas públicas de la cafetería.
 */
router.get('/', async (req, res, next) => {
  try {
    res.json({ comentarios: await comentarios.listar() });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/comentarios
 *
 * La longitud y el rango se validan en comentarios.service.
 */
router.post('/', async (req, res, next) => {
  try {
    const { autor, texto, calificacion } = req.body || {};
    const comentario = await comentarios.crear({
      autor,
      texto,
      calificacion,
    });
    res.status(201).json(comentario);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/comentarios/:id
 * Riesgo residual: no exige sesión ni rol.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const comentario = await comentarios.eliminar(req.params.id);
    if (!comentario) {
      return res.status(404).json({ error: 'Comentario no encontrado.' });
    }
    res.json(comentario);
  } catch (err) {
    next(err);
  }
});

export default router;
