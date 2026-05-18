#!/bin/bash
set -e

echo "=== RightMind Startup ==="

# Run Prisma migrations to ensure DB schema is up to date
echo "Running Prisma DB push..."
npx prisma db push --skip-generate

echo "Starting Next.js (standalone)..."
cd /app/.next/standalone
exec node server.js
