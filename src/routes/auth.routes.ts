import express from 'express';
import rateLimit from 'express-rate-limit';
import * as usuarios from '../services/usuarios.service';
import { crearSesion, destruirSesion, obtenerSesion } from '../middleware/sesion';

const router = express.Router();

// Protección contra fuerza bruta (VUL-14 / AUTH-04): límite entre 3 y 9 intentos fallidos.
const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos de inicio de sesión. Intentá nuevamente más tarde.' },
});

/**
 * Inicio de sesión. Limitado a 5 intentos fallidos cada 15 minutos, con
 * mensaje de error genérico y una sesión nueva en cada login.
 */
router.post('/login', limitadorLogin, async (req, res, next) => {
  try {
    const { username, password } = req.body || {};

    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ error: 'Falta usuario o contraseña.' });
    }

    // Consulta parametrizada y comparación con bcrypt (ver usuarios.service).
    const usuario = await usuarios.autenticar(username, password);

    if (!usuario) {
      // CORRECCIÓN (VUL-19 / AUTH-12 y VUL-06 / XSS-02):
      // Se unifica el mensaje para no permitir enumeración de usuarios ni reflejar
      // el username crudo en la respuesta de error.
      // (Antes distinguía entre "La contraseña es incorrecta." y
      // `El usuario "${username}" no existe en el sistema.`).
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    // Regenera la sesión al autenticar para evitar fijación de sesión.
    destruirSesion(req);
    crearSesion(req, res, {
      id: usuario.id,
      username: usuario.username,
      rol: usuario.rol,
      nombre: usuario.nombre,
    });

    res.json({
      mensaje: `¡Bienvenido, ${usuario.nombre}!`,
      usuario: {
        id: usuario.id,
        username: usuario.username,
        rol: usuario.rol,
        nombre: usuario.nombre,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Cierre de sesión.
 */
router.post('/logout', (req, res) => {
  // CORRECCIÓN (VUL-18 / AUTH-11): invalida la sesión en el servidor antes de limpiar la cookie.
  destruirSesion(req);
  res.clearCookie('sid', { path: '/' });
  res.json({ mensaje: 'Sesión cerrada.' });
});

/** Devuelve el usuario de la sesión actual. */
router.get('/yo', (req, res) => {
  const sesion = obtenerSesion(req);
  if (!sesion) {
    return res.status(401).json({ error: 'Necesitás iniciar sesión.' });
  }
  res.json({ usuario: sesion.usuario });
});

export default router;