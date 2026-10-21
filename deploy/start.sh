#!/bin/sh
set -eu
node /app/dist/migrate.mjs
exec node /app/dist/index.mjs
