# Equipo A: correcciones

- **VUL-26:** la base exige contraseña (`scram-sha-256`) y la app se conecta como `origen_app`, sin privilegios de superusuario.
- **CFG-02:** las credenciales de la base y el secreto de sesión se leen solo de variables de entorno, y la app no arranca si falta alguno.
- **CFG-05:** el contenedor corre con el usuario `node` en lugar de `root`.
