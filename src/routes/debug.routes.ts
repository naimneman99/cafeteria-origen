import express from 'express';

import { requiereRol, requiereSesion } from '../middleware/auth';

const router = express.Router();

/**
 * Endpoint de diagnóstico protegido (VUL-23).
 *
 * Exige sesión activa y rol administrador, y expone únicamente información
 * operativa no sensible (versión y tiempo activo), sin variables de entorno
 * ni credenciales.
 */
router.use(requiereSesion, requiereRol('admin'));

router.get('/', (_req, res) => {
  res.json({
    mensaje: 'Diagnóstico del servidor',
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
  });
});

export default router;
