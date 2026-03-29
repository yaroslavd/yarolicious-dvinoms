#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Apply schema to production database
pnpm --filter db push

# Create dev database if it doesn't exist and apply schema
DEV_URL=$(node -e "const u=process.env.DATABASE_URL; console.log(u.replace(/\/[^/?]+(\?.*)?$/, '/heliumdb_dev\$1'))")
psql "$DATABASE_URL" -c "CREATE DATABASE heliumdb_dev;" 2>/dev/null || true
DATABASE_URL_DEV="$DEV_URL" NODE_ENV=development pnpm --filter db push:dev

pnpm exec playwright install chromium
