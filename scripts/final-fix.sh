#!/bin/bash
# Final fix script - resolves calendar plugin view type collision
# Run this from gtm-brain directory

set -e  # Exit on any error

echo "=========================================="
echo "🔧 FINAL FIX: Calendar Plugin View Type"
echo "=========================================="
echo ""

cd /Users/keiganpesenti/revops_weekly_update/gtm-brain

# Step 1: Build calendar plugin (with fixed view type)
echo "📅 Step 1/4: Building calendar plugin..."
cd eudia-calendar-plugin
npx esbuild main.ts --bundle --external:obsidian --format=cjs --outfile=main.js --platform=node 2>&1
echo "   ✅ Calendar plugin built"

# Step 2: Build transcription plugin
echo ""
echo "🎙️  Step 2/4: Building transcription plugin..."
cd ../obsidian-plugin
npx esbuild main.ts --bundle --external:obsidian --format=cjs --outfile=main.js --platform=node 2>&1
echo "   ✅ Transcription plugin built"

# Step 3: Rebuild vault
echo ""
echo "🏗️  Step 3/4: Rebuilding vault..."
cd ..
node scripts/build-vault.js 2>&1

# Step 4: Copy and deploy
echo ""
echo "🚀 Step 4/4: Deploying..."
cp dist/BL-Sales-Vault.zip public/downloads/
git add -A
git commit -m "fix: Calendar view type collision - eudia-calendar-standalone" 2>&1 || echo "   (no changes to commit)"
git push origin main 2>&1

echo ""
echo "=========================================="
echo "✅ COMPLETE! Next steps:"
echo "=========================================="
echo ""
echo "1. Wait 2 minutes for Render to deploy"
echo "2. CLOSE all existing vaults in Obsidian"
echo "3. Download fresh vault from GTM site"
echo "4. Extract and open as NEW vault in Obsidian"
echo ""
echo "The calendar plugin now uses 'eudia-calendar-standalone'"
echo "view type to avoid collision with transcription plugin."
echo ""
