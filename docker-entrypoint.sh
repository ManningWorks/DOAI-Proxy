#!/bin/sh

set -e

echo "=== Startup Sync ==="
echo "Running opencode config sync on startup..."

# Run the sync script
node /app/scripts/sync-opencode-config.js

echo "=== Starting Server ==="
exec node server.js
