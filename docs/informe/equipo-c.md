# Equipo C: correcciones

- VUL-25 (CFG-01, XSS-03): se configura `helmet` en `src/app.ts` antes de los archivos estáticos y rutas de la API, con `Content-Security-Policy` (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `img-src 'self' data:` para el favicon SVG y `upgradeInsecureRequests` desactivado para el entorno local HTTP).
- VUL-24 (VAL-06): en `src/middleware/errores.ts` se ajusta `manejadorErrores` para devolver el mensaje controlado cuando `status < 500` y un mensaje genérico ante errores `500`, dejando el stack trace y el detalle técnico únicamente en los logs del servidor.
- VUL-23 (CFG-03, CFG-04): se protege `src/routes/debug.routes.ts` con `requiereSesion` y `requiereRol('admin')`, eliminando el acceso a `process.env` y devolviendo únicamente datos no sensibles (`version` y `uptime`).
- VUL-06 (XSS-02, productos y 404): se reemplazan los mensajes con interpolación de entrada del usuario en `rutaNoEncontrada` (`src/middleware/errores.ts`) y en `GET /api/productos/:id` (`src/routes/productos.routes.ts`) por mensajes fijos (`Ruta no encontrada.` y `Producto no encontrado.`).

Observaciones y verificación:
- Pruebas manuales (localhost): capturas del antes y después en `docs/informe/evidencias/equipo-c/` (cabeceras en DevTools sin bloqueos de CSP, `/api/_diagnostico` protegido con 401/403, respuestas 404 sin HTML reflejado y errores sin stack trace).
- Tests y checklist: verificados con `npm test`, `npm run test:seguridad`, `tests/extra-c.test.ts` y `npm run check:security` (`XSS-02`, `XSS-03`, `CFG-01`, `CFG-03`, `CFG-04` y `VAL-06` en verde).

