#!/bin/sh

set -e

echo "=== Startup Sync ==="
echo "Running opencode config sync on startup..."

# Run the sync script (non-blocking - server should start regardless)
node /app/scripts/sync-opencode-config.js || echo "⚠️  Config sync skipped (non-fatal)"

echo "=== Starting Server ==="
exec node server.js
