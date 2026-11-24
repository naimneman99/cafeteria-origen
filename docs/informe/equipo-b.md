# Equipo B: correcciones
VUL-15: la cookie de sesión (sid) se configura con httpOnly: true, sameSite: 'lax', path: '/', maxAge y secure en producción (config.nodeEnv === 'production'), en lugar de enviarse sin banderas.

VUL-16: los identificadores de sesión se generan con crypto.randomBytes(32).toString('hex') y se elimina el contador secuencial previo (sesion_1, sesion_2...) para evitar IDs predecibles.

VUL-17: se agrega control de expiración absoluta y por inactividad en las sesiones (src/tipos.ts y src/middleware/sesion.ts), descartando y eliminando las sesiones vencidas al consultarlas para que devuelvan 401.

VUL-14: se aplica limitación de intentos (express-rate-limit) sobre POST /api/auth/login con ventana de 15 minutos, tope de 5 intentos fallidos (skipSuccessfulRequests: true) y respuesta 429 ante fuerza bruta, manteniendo la compatibilidad con los tests funcionales.

VUL-18: en POST /api/auth/logout se destruye la sesión en el servidor antes de limpiar la cookie sid, evitando que un identificador copiado siga funcionando tras cerrar sesión.

VUL-19 y VUL-06 (login): ante credenciales inválidas en el login se devuelve un mensaje genérico (401) sin distinguir si el usuario existe ni reflejar el username enviado, y se destruye cualquier sesión previa antes de crear una nueva al autenticar.

VUL-20: en src/routes/admin.routes.ts se exige sesión válida y rol 'admin' (requiereSesion, requiereRol('admin')) sobre las rutas de administración para bloquear el acceso a usuarios sin ese rol.

VUL-21: en PUT /api/admin/usuarios/:id se valida que el rol recibido pertenezca a la lista de roles permitidos ('admin', 'cliente'), respondiendo 400 ante valores inválidos junto con el control de autorización de administrador.

VUL-28 (riesgo residual — IDOR en pedidos): los endpoints de pedidos (GET /api/pedidos, GET /api/pedidos/:id y PATCH /api/pedidos/:id/estado) siguen accesibles sin autenticación porque tests/pedidos.test.ts los prueba sin sesión; queda documentado como riesgo residual y en un proyecto real se exigiría validar propiedad/sesión o token del pedido para lectura y rol de personal/admin para cambiar estados.

VUL-22: en POST /api/admin/probar-conexion se valida el host contra lista blanca y patrón estricto, y se ejecuta ping con spawn('ping', ['-c', '3', host], { shell: false }) con argumentos separados en vez de exec con shell.

VUL-12: en POST /api/admin/subir-archivo se sanea el nombre con path.basename, se valida la extensión (.png, .jpg, .jpeg, .webp), el tamaño máximo (2 MB) y la firma real de bytes de la imagen, guardando con nombre aleatorio dentro de config.uploadsDir y verificando que la ruta resuelta no salga de la carpeta de subidas.

Observaciones y verificación:
Pruebas manuales (localhost): completar con las capturas o notas de lo observado a mano en el navegador/cliente contra localhost en docs/informe/evidencias/b/ (cookies en DevTools, respuesta tras logout, bloqueo por intentos fallidos, acceso con rol cliente al panel, y pruebas manuales de probar-conexion y subir-archivo).

Tests y checklist: verificados con npm test (28/28 en verde) y las suites de seguridad correspondientes (AUTH-04 a AUTH-12, AUTH-14, CSRF-02, VAL-04, VAL-05, CMD-01 a CMD-03 y tests/extra-b.test.ts en verde).