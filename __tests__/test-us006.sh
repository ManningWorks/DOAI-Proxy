#!/bin/bash

echo "Testing US-006 streaming simulation module..."
echo ""

echo "1. Starting proxy server..."
npm start > /tmp/proxy.log 2>&1 &
SERVER_PID=$!

sleep 2

echo "2. Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:8000/health)
if [ "$HEALTH_RESPONSE" = '{"status":"ok","service":"straico-proxy"}' ]; then
  echo "   ✓ Health check passed"
else
  echo "   ✗ Health check failed"
  cat /tmp/proxy.log
  kill $SERVER_PID
  exit 1
fi

echo ""
echo "3. Testing streaming module directly..."
node __tests__/test-streaming.js
if [ $? -eq 0 ]; then
  echo "   ✓ Streaming module test passed"
else
  echo "   ✗ Streaming module test failed"
  kill $SERVER_PID
  exit 1
fi

echo ""
echo "4. Cleaning up..."
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

echo ""
echo "✓ All tests passed! US-006 is complete."
