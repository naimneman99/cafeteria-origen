import path from 'path';

/**
 * Configuración de la aplicación.
 *
 * Los secretos (usuario y contraseña de la base, secreto de sesión) se leen
 * solo de variables de entorno, sin valores por defecto: si falta alguno, la
 * aplicación no arranca. En Docker los provee docker-compose.yml a partir del
 * archivo .env (ver .env.example).
 */
function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre} (ver .env.example).`);
  }
  return valor;
}

export default {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'db',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'origen',
    user: requerida('DB_USER'),
    password: requerida('DB_PASSWORD'),
  },

  // Se usa para firmar el token anti-CSRF.
  sessionSecret: requerida('SESSION_SECRET'),

  uploadsDir: process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads'),
};
