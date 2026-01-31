#!/bin/bash
# Deploy fix script - transcription method fix, emoji removal, calendar sync
set -e

echo "=========================================="
echo "DEPLOYING: Transcription Fix + Clean UI"
echo "=========================================="
echo ""

cd /Users/keiganpesenti/revops_weekly_update/gtm-brain

# Step 1: Build calendar plugin
echo "Step 1/4: Building calendar plugin..."
cd eudia-calendar-plugin
npx esbuild main.ts --bundle --external:obsidian --format=cjs --outfile=main.js --platform=node 2>&1
echo "  Calendar plugin built"

# Step 2: Build transcription plugin
echo ""
echo "Step 2/4: Building transcription plugin..."
cd ../obsidian-plugin
npx esbuild main.ts --bundle --external:obsidian --format=cjs --outfile=main.js --platform=node 2>&1
echo "  Transcription plugin built"

# Step 3: Rebuild vault
echo ""
echo "Step 3/4: Rebuilding vault..."
cd ..
node scripts/build-vault.js 2>&1

# Step 4: Copy and deploy
echo ""
echo "Step 4/4: Deploying to Render..."
cp dist/BL-Sales-Vault.zip public/downloads/
git add -A
git commit -m "fix: Transcription method names, remove emojis, add calendar sync button" 2>&1 || echo "  (no changes to commit)"
git push origin main 2>&1

echo ""
echo "=========================================="
echo "DEPLOYMENT COMPLETE"
echo "=========================================="
echo ""
echo "Changes deployed:"
echo "  - Fixed transcription start/stop methods"
echo "  - Removed all emojis from UI"
echo "  - Changed 'recording' -> 'transcription' in messages"
echo "  - Added 'Sync Calendar' button in settings"
echo ""
echo "Next steps:"
echo "  1. Wait 2 minutes for Render deploy"
echo "  2. Download fresh vault from GTM site"
echo "  3. Open as NEW vault in Obsidian"
echo ""
