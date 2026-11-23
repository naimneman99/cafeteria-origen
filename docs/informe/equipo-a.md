# Equipo A: correcciones

- **VUL-26:** la base exige contraseña (`scram-sha-256`) y la app se conecta como `origen_app`, sin privilegios de superusuario.
- **CFG-02:** las credenciales de la base y el secreto de sesión se leen solo de variables de entorno, y la app no arranca si falta alguno.
- **CFG-05:** el contenedor corre con el usuario `node` en lugar de `root`.
- **VUL-01:** el login busca usuario y contraseña con una consulta parametrizada (`$1`, `$2`).
- **VUL-02:** los filtros del catálogo (tipo, variedad y búsqueda) y la búsqueda por id se pasan como parámetros, no se concatenan.
- **VUL-03:** el filtro de pedidos por mesa usa una consulta parametrizada.
- **VUL-04:** el reporte por origen filtra con un parámetro en el `WHERE`, antes del `GROUP BY`, así que un `UNION` no puede leer otras tablas.
- **VUL-13:** las contraseñas se guardan con hash bcrypt (costo 12), el login las verifica con `bcrypt.compare` y las filas viejas en texto plano se hashean al arrancar.
- **VUL-27:** las contraseñas de las cuentas iniciales salen de variables de entorno y no quedan credenciales de fábrica en el código.
