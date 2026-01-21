#!/bin/bash
# Hyprnote Sync Setup Script for Justin
# Run with: bash setup-justin.sh

set -e  # Exit on any error

echo ""
echo "========================================="
echo "  HYPRNOTE SYNC SETUP"
echo "========================================="
echo ""

# Step 1: Clean up any previous failed attempts
echo "Step 1: Cleaning up previous attempts..."
rm -rf ~/Documents/hyprnote-sync 2>/dev/null || true
rm -rf ~/Documents/temp-clone 2>/dev/null || true
echo "  ✓ Cleaned"

# Step 2: Create fresh directory
echo ""
echo "Step 2: Creating hyprnote-sync folder..."
mkdir -p ~/Documents/hyprnote-sync/lib
mkdir -p ~/Documents/hyprnote-sync/data
cd ~/Documents/hyprnote-sync
echo "  ✓ Created at ~/Documents/hyprnote-sync"

# Step 3: Download required files
echo ""
echo "Step 3: Downloading files from GitHub..."
BASE_URL="https://raw.githubusercontent.com/cicerotech/gtm-wizard/main/hyprnote-sync"

curl -sL "$BASE_URL/package.json" -o package.json
echo "  ✓ package.json"

curl -sL "$BASE_URL/sync.js" -o sync.js
echo "  ✓ sync.js"

curl -sL "$BASE_URL/setup-quick.js" -o setup-quick.js
echo "  ✓ setup-quick.js"

curl -sL "$BASE_URL/lib/hyprnote.js" -o lib/hyprnote.js
echo "  ✓ lib/hyprnote.js"

curl -sL "$BASE_URL/lib/salesforce.js" -o lib/salesforce.js
echo "  ✓ lib/salesforce.js"

curl -sL "$BASE_URL/lib/matcher.js" -o lib/matcher.js
echo "  ✓ lib/matcher.js"

curl -sL "$BASE_URL/lib/obsidian.js" -o lib/obsidian.js
echo "  ✓ lib/obsidian.js"

curl -sL "$BASE_URL/lib/team-registry.js" -o lib/team-registry.js
echo "  ✓ lib/team-registry.js"

# Step 4: Create .env with credentials
echo ""
echo "Step 4: Creating credentials file..."
cat > .env << 'ENVFILE'
SF_USERNAME=sync.service@eudia.com
SF_PASSWORD=Augment2026!
SF_SECURITY_TOKEN=RXizwN59kueiS8dlXjWivVl2
SF_INSTANCE_URL=https://eudia.my.salesforce.com
ENVFILE
echo "  ✓ Credentials saved"

# Step 5: Install npm packages
echo ""
echo "Step 5: Installing dependencies..."
npm install --silent 2>/dev/null || npm install
echo "  ✓ Dependencies installed"

# Step 6: Run initial setup
echo ""
echo "Step 6: Running setup wizard..."
echo ""
node setup-quick.js

echo ""
echo "========================================="
echo "  SETUP COMPLETE!"
echo "========================================="
echo ""
echo "To sync your meetings, run:"
echo "  cd ~/Documents/hyprnote-sync && npm run sync"
echo ""

