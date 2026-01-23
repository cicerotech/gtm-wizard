#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# EUDIA VAULT EXPORT - Pull all team notes to your admin vault
# ═══════════════════════════════════════════════════════════════════════════════
# Double-click to export all team meeting notes to your Obsidian vault.
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
echo -e "${CYAN}║${NC}        ${BOLD}EUDIA VAULT EXPORT${NC}                                        ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}        GTM Brain → Admin Vault                                    ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                                   ${CYAN}║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

API_URL="https://gtm-wizard.onrender.com/api/obsidian/export"
CONFIG_FILE="$HOME/.eudia-admin-vault"

# Find or configure admin vault
get_vault_path() {
    if [ -f "$CONFIG_FILE" ]; then
        cat "$CONFIG_FILE"
        return
    fi
    
    echo ""
    echo -e "${YELLOW}   First time setup${NC}"
    echo "   Enter the path to your admin Obsidian vault:"
    echo "   (e.g., /Users/keigan/Documents/Eudia-Admin)"
    echo ""
    read -p "   Vault path: " vault_path
    
    if [ ! -d "$vault_path" ]; then
        echo -e "${RED}   ✗ Folder not found${NC}"
        exit 1
    fi
    
    echo "$vault_path" > "$CONFIG_FILE"
    echo "$vault_path"
}

VAULT_PATH=$(get_vault_path)
EXPORT_DIR="$VAULT_PATH/Team Notes"

echo -e "${BLUE}[1/3]${NC} Admin vault: $VAULT_PATH"

# Create export directory
mkdir -p "$EXPORT_DIR"

echo -e "${BLUE}[2/3]${NC} Fetching notes from GTM Brain..."

# Fetch JSON export
EXPORT_JSON=$(curl -s "$API_URL?format=full" 2>/dev/null)

if [ -z "$EXPORT_JSON" ]; then
    echo -e "${RED}   ✗ Could not connect to GTM Brain${NC}"
    read -p "   Press Enter to exit..."
    exit 1
fi

TOTAL_NOTES=$(echo "$EXPORT_JSON" | jq -r '.totalNotes // 0')
echo -e "${GREEN}   ✓ Found $TOTAL_NOTES notes${NC}"

echo -e "${BLUE}[3/3]${NC} Exporting to vault..."

# Parse JSON and create markdown files organized by account
echo "$EXPORT_JSON" | jq -c '.notes[]?' 2>/dev/null | while read -r note; do
    account=$(echo "$note" | jq -r '.accountName // "Unknown"')
    title=$(echo "$note" | jq -r '.noteTitle // "Untitled"')
    date=$(echo "$note" | jq -r '.noteDate // empty' | cut -d'T' -f1)
    summary=$(echo "$note" | jq -r '.summary // .fullSummary // "No content"')
    sentiment=$(echo "$note" | jq -r '.sentiment // "Neutral"')
    bl=$(echo "$note" | jq -r '.blEmail // "unknown"' | cut -d'@' -f1)
    
    # Create account folder
    account_dir="$EXPORT_DIR/$account"
    mkdir -p "$account_dir"
    
    # Create note file
    safe_title=$(echo "$title" | tr '/:*?"<>|' '-')
    note_file="$account_dir/${date:-$(date +%Y-%m-%d)} - $safe_title.md"
    
    cat > "$note_file" << EOF
---
account: $account
date: $date
synced_by: $bl
sentiment: $sentiment
source: gtm-brain
---

# $title

$summary
EOF
    
    echo -e "   📝 $account / $title"
done

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     ${BOLD}✓ EXPORT COMPLETE${NC}                                             ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     Notes saved to: $EXPORT_DIR            ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

read -p "   Press Enter to close..."

