#!/bin/bash
# Build script for Eudia plugins and vault
# Run from: /Users/keiganpesenti/revops_weekly_update/gtm-brain

set -e  # Exit on error

echo "=== Building Eudia Calendar Plugin ==="
cd /Users/keiganpesenti/revops_weekly_update/gtm-brain/eudia-calendar-plugin
npx esbuild main.ts --bundle --external:obsidian --format=cjs --outfile=main.js --platform=node

echo ""
echo "=== Building Eudia Transcription Plugin ==="
cd /Users/keiganpesenti/revops_weekly_update/gtm-brain/obsidian-plugin
npx esbuild main.ts --bundle --external:obsidian --format=cjs --outfile=main.js --platform=node

echo ""
echo "=== Building Vault ==="
cd /Users/keiganpesenti/revops_weekly_update/gtm-brain
node scripts/build-vault.js

echo ""
echo "=== Copying to public downloads ==="
cp dist/BL-Sales-Vault.zip public/downloads/

echo ""
echo "=== Committing and pushing ==="
git add -A
git commit -m "fix: Calendar plugin debugging, OAuth status polling, Eudia-branded success page"
git push origin main

echo ""
echo "=== BUILD COMPLETE ==="
echo "Vault is at: /Users/keiganpesenti/revops_weekly_update/gtm-brain/dist/BL-Sales-Vault.zip"
