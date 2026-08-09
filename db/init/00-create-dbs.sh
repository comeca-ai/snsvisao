#!/bin/bash
# Executado automaticamente pelo postgres:16-alpine no primeiro boot
# (scripts em /docker-entrypoint-initdb.d/). Garante que o database
# fio_evolution exista — a Evolution API usa um banco separado do app.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  SELECT 'CREATE DATABASE fio_evolution'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fio_evolution')\gexec
SQL
