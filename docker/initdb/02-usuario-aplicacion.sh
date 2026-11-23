#!/bin/sh
# =============================================================================
# Usuario de aplicación con mínimos privilegios.
#
# La app se conecta como origen_app, que NO es superusuario: no puede crear
# bases, usuarios ni tocar el esquema. Solo lee y escribe datos.
#
# La contraseña sale de la variable DB_PASSWORD (archivo .env), así no queda
# ningún secreto versionado. Como todo /docker-entrypoint-initdb.d, corre una
# sola vez, con el volumen vacío.
# =============================================================================
set -eu

psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" \
     --dbname "$POSTGRES_DB" \
     -v app_password="$DB_PASSWORD" <<'SQL'
CREATE ROLE origen_app LOGIN PASSWORD :'app_password';

GRANT CONNECT ON DATABASE origen TO origen_app;
GRANT USAGE ON SCHEMA public TO origen_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO origen_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO origen_app;
SQL
