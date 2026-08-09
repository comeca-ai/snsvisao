#!/bin/bash
# Executado automaticamente pelo postgres:16-alpine no primeiro boot
# (scripts em /docker-entrypoint-initdb.d/). Garante que os databases
# auxiliares existam — cada servico usa um banco separado do app:
#   - fio_evolution: dados da Evolution API
#   - fio_web: historico do canal web (chat do Fio)
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  SELECT 'CREATE DATABASE fio_evolution'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fio_evolution')\gexec
  SELECT 'CREATE DATABASE fio_web'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fio_web')\gexec
SQL
