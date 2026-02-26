#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# EUDIA PLUGIN UPDATER - One-click update to the latest version
# ═══════════════════════════════════════════════════════════════════════════════
# Double-click this file to update your Eudia plugin to the latest version.
# It will automatically find your vault and download the newest files.
# ═══════════════════════════════════════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

clear

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}                                                                   ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}        ${BOLD}EUDIA PLUGIN UPDATER${NC}                                       ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}        Download & install the latest version                       ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                                   ${CYAN}║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

SERVER="https://gtm-wizard.onrender.com"
PLUGIN_FOLDER=".obsidian/plugins/eudia-transcription"

# ── Step 1: Find the vault ──────────────────────────────────────────────────

echo -e "${BLUE}[1/4]${NC} Searching for your Eudia vault..."

VAULT_DIR=""

# First check: is this script inside a vault?
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$SCRIPT_DIR/$PLUGIN_FOLDER" ]; then
    VAULT_DIR="$SCRIPT_DIR"
fi

# Search common locations if not found yet
if [ -z "$VAULT_DIR" ]; then
    SEARCH_DIRS=("$HOME/Documents" "$HOME/Desktop" "$HOME" "$HOME/Library/Mobile Documents" "$HOME/Downloads")
    for dir in "${SEARCH_DIRS[@]}"; do
        if [ ! -d "$dir" ]; then continue; fi
        FOUND=$(find "$dir" -maxdepth 4 -type d -name "eudia-transcription" -path "*/.obsidian/plugins/*" 2>/dev/null | head -1)
        if [ -n "$FOUND" ]; then
            VAULT_DIR=$(echo "$FOUND" | sed 's|/.obsidian/plugins/eudia-transcription||')
            break
        fi
    done
fi

if [ -z "$VAULT_DIR" ]; then
    echo -e "${YELLOW}   Could not auto-detect your vault.${NC}"
    echo ""
    echo "   Please drag your vault folder here and press Enter:"
    echo "   (the folder that contains .obsidian/)"
    echo ""
    read -p "   Vault path: " VAULT_DIR
    VAULT_DIR=$(echo "$VAULT_DIR" | sed "s/^'//" | sed "s/'$//" | xargs)
fi

PLUGIN_DIR="$VAULT_DIR/$PLUGIN_FOLDER"

if [ ! -d "$PLUGIN_DIR" ]; then
    echo -e "${RED}   ✗ Plugin folder not found at:${NC}"
    echo "     $PLUGIN_DIR"
    echo ""
    echo "   Make sure you opened this vault in Obsidian at least once"
    echo "   and enabled the Eudia Transcription Plugin."
    echo ""
    read -p "   Press Enter to exit..."
    exit 1
fi

echo -e "${GREEN}   ✓ Found vault: ${VAULT_DIR##*/}${NC}"

# ── Step 2: Check current version ──────────────────────────────────────────

CURRENT_VERSION="unknown"
if [ -f "$PLUGIN_DIR/manifest.json" ]; then
    CURRENT_VERSION=$(python3 -c "import json; print(json.load(open('$PLUGIN_DIR/manifest.json'))['version'])" 2>/dev/null || echo "unknown")
fi
echo -e "${BLUE}[2/4]${NC} Current version: v${CURRENT_VERSION}"

# ── Step 3: Download latest plugin files ────────────────────────────────────

echo -e "${BLUE}[3/4]${NC} Downloading latest plugin from server..."
echo -e "       ${YELLOW}(server may take ~30s to wake up)${NC}"

# Back up current files
if [ -f "$PLUGIN_DIR/main.js" ]; then
    cp "$PLUGIN_DIR/main.js" "$PLUGIN_DIR/main.js.bak" 2>/dev/null
fi
if [ -f "$PLUGIN_DIR/styles.css" ]; then
    cp "$PLUGIN_DIR/styles.css" "$PLUGIN_DIR/styles.css.bak" 2>/dev/null
fi

DOWNLOAD_OK=true

# Download main.js (largest file — retry up to 3 times)
for attempt in 1 2 3; do
    HTTP_CODE=$(curl -sS -w "%{http_code}" --connect-timeout 60 --max-time 120 \
        -o "$PLUGIN_DIR/main.js.new" "$SERVER/api/plugin/main.js" 2>/dev/null)
    if [ "$HTTP_CODE" = "200" ] && [ -s "$PLUGIN_DIR/main.js.new" ]; then
        break
    fi
    if [ "$attempt" -lt 3 ]; then
        echo -e "       ${YELLOW}Retrying download (attempt $((attempt+1))/3)...${NC}"
        sleep 5
    else
        echo -e "${RED}   ✗ Failed to download main.js (HTTP $HTTP_CODE)${NC}"
        rm -f "$PLUGIN_DIR/main.js.new"
        DOWNLOAD_OK=false
    fi
done

# Download manifest.json
if $DOWNLOAD_OK; then
    HTTP_CODE=$(curl -sS -w "%{http_code}" --connect-timeout 30 --max-time 30 \
        -o "$PLUGIN_DIR/manifest.json.new" "$SERVER/api/plugin/manifest.json" 2>/dev/null)
    if [ "$HTTP_CODE" != "200" ] || [ ! -s "$PLUGIN_DIR/manifest.json.new" ]; then
        echo -e "${RED}   ✗ Failed to download manifest.json${NC}"
        rm -f "$PLUGIN_DIR/manifest.json.new"
        DOWNLOAD_OK=false
    fi
fi

# Download styles.css
if $DOWNLOAD_OK; then
    HTTP_CODE=$(curl -sS -w "%{http_code}" --connect-timeout 30 --max-time 30 \
        -o "$PLUGIN_DIR/styles.css.new" "$SERVER/api/plugin/styles.css" 2>/dev/null)
    if [ "$HTTP_CODE" != "200" ] || [ ! -s "$PLUGIN_DIR/styles.css.new" ]; then
        echo -e "${RED}   ✗ Failed to download styles.css${NC}"
        rm -f "$PLUGIN_DIR/styles.css.new"
        DOWNLOAD_OK=false
    fi
fi

if ! $DOWNLOAD_OK; then
    echo ""
    echo -e "${RED}   Download failed. Restoring backups...${NC}"
    [ -f "$PLUGIN_DIR/main.js.bak" ] && mv "$PLUGIN_DIR/main.js.bak" "$PLUGIN_DIR/main.js"
    rm -f "$PLUGIN_DIR/main.js.new" "$PLUGIN_DIR/manifest.json.new" "$PLUGIN_DIR/styles.css.new"
    echo ""
    echo "   The server may be temporarily unavailable."
    echo "   Please wait a minute and try again."
    echo ""
    read -p "   Press Enter to exit..."
    exit 1
fi

# Validate downloads (basic size checks)
MAIN_SIZE=$(wc -c < "$PLUGIN_DIR/main.js.new" | tr -d ' ')
MANIFEST_SIZE=$(wc -c < "$PLUGIN_DIR/manifest.json.new" | tr -d ' ')
STYLES_SIZE=$(wc -c < "$PLUGIN_DIR/styles.css.new" | tr -d ' ')

if [ "$MAIN_SIZE" -lt 10000 ] || [ "$MANIFEST_SIZE" -lt 50 ] || [ "$STYLES_SIZE" -lt 100 ]; then
    echo -e "${RED}   ✗ Downloaded files look too small — aborting.${NC}"
    echo "     main.js: ${MAIN_SIZE} bytes, manifest.json: ${MANIFEST_SIZE} bytes, styles.css: ${STYLES_SIZE} bytes"
    rm -f "$PLUGIN_DIR/main.js.new" "$PLUGIN_DIR/manifest.json.new" "$PLUGIN_DIR/styles.css.new"
    [ -f "$PLUGIN_DIR/main.js.bak" ] && mv "$PLUGIN_DIR/main.js.bak" "$PLUGIN_DIR/main.js"
    echo ""
    read -p "   Press Enter to exit..."
    exit 1
fi

# ── Step 4: Install ────────────────────────────────────────────────────────

echo -e "${BLUE}[4/4]${NC} Installing update..."

mv "$PLUGIN_DIR/main.js.new" "$PLUGIN_DIR/main.js"
mv "$PLUGIN_DIR/manifest.json.new" "$PLUGIN_DIR/manifest.json"
mv "$PLUGIN_DIR/styles.css.new" "$PLUGIN_DIR/styles.css"

# Clean up backups
rm -f "$PLUGIN_DIR/main.js.bak" "$PLUGIN_DIR/styles.css.bak"

NEW_VERSION=$(python3 -c "import json; print(json.load(open('$PLUGIN_DIR/manifest.json'))['version'])" 2>/dev/null || echo "latest")

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     ${BOLD}✓ UPDATE COMPLETE${NC}                                              ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     v${CURRENT_VERSION} → v${NEW_VERSION}                                               ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     ${BOLD}Please close Obsidian (Cmd+Q) and reopen it.${NC}                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     Future updates will happen automatically.                      ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

read -p "   Press Enter to close..."
