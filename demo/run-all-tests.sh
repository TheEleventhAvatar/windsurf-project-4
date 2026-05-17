#!/bin/bash
# Quick demo runner showing API-level vs browser-level test results

echo "🎬 DEMO: API Success vs Browser-Visible Failure"
echo "=============================================="
echo ""
echo "📌 Running API-level test (expected: ✅ PASS)..."
echo ""
npx vitest run tests/demo-api.test.ts --reporter=verbose
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📌 Running browser-level test (expected: ❌ FAIL)..."
echo ""
npx vitest run tests/demo-browser.test.ts --reporter=verbose
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📌 Running visual demo (screenshots captured)..."
echo ""
npx ts-node demo/visual-demo.ts
echo ""
echo "✅ Demo complete!"
echo "📸 View: demo-screenshots/ folder"
echo "📖 Read: demo/DEMO-SUMMARY.md for full explanation"
