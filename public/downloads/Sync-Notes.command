#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# EUDIA MEETING SYNC - Obsidian Notes → GTM Brain
# ═══════════════════════════════════════════════════════════════════════════════
# Double-click to sync your meeting notes to GTM Brain & Salesforce.
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
echo -e "${CYAN}║${NC}        ${BOLD}EUDIA MEETING SYNC${NC}                                        ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}        Obsidian → GTM Brain → Salesforce                          ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                                   ${CYAN}║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# GTM Brain API endpoint
API_URL="https://gtm-wizard.onrender.com/api/obsidian/sync-notes"

# Find Obsidian vault
find_vault() {
    local search_paths=(
        "$HOME/Documents/Eudia Meetings"
        "$HOME/Documents/Obsidian/Eudia Meetings"
        "$HOME/Obsidian/Eudia Meetings"
        "$HOME/Documents"
    )
    
    for base in "${search_paths[@]}"; do
        if [ -d "$base" ]; then
            # Look for .obsidian folder (indicates vault)
            if [ -d "$base/.obsidian" ]; then
                echo "$base"
                return 0
            fi
            # Search one level deep
            for dir in "$base"/*/; do
                if [ -d "$dir/.obsidian" ]; then
                    echo "${dir%/}"
                    return 0
                fi
            done
        fi
    done
    return 1
}

# Get user's email
get_user_email() {
    # Try to get from git config
    local email=$(git config --global user.email 2>/dev/null)
    if [[ "$email" == *"@eudia.com" ]]; then
        echo "$email"
        return
    fi
    
    # Check for saved config
    if [ -f "$HOME/.eudia-sync-config" ]; then
        cat "$HOME/.eudia-sync-config"
        return
    fi
    
    # Ask user
    echo ""
    read -p "   Enter your Eudia email: " email
    echo "$email" > "$HOME/.eudia-sync-config"
    echo "$email"
}

# Main sync function
sync_notes() {
    local vault_path="$1"
    local user_email="$2"
    local meetings_path="$vault_path/Meetings"
    
    if [ ! -d "$meetings_path" ]; then
        echo -e "${YELLOW}   ⚠ No Meetings folder found in vault${NC}"
        echo "   Creating Meetings folder..."
        mkdir -p "$meetings_path/_Inbox"
    fi
    
    # Find markdown files modified in last 7 days
    echo -e "${BLUE}   Scanning for recent notes...${NC}"
    
    local notes_found=0
    local notes_synced=0
    local notes_failed=0
    
    while IFS= read -r -d '' file; do
        notes_found=$((notes_found + 1))
        local filename=$(basename "$file")
        local relative_path="${file#$vault_path/}"
        
        # Extract account name from folder structure (Meetings/AccountName/note.md)
        local account_folder=$(dirname "$relative_path" | sed 's|Meetings/||' | cut -d'/' -f1)
        
        # Skip _Inbox and Templates
        if [[ "$account_folder" == "_Inbox" || "$account_folder" == "Templates" || "$account_folder" == "Meetings" ]]; then
            continue
        fi
        
        # Read file content
        local content=$(cat "$file")
        local note_date=$(echo "$filename" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}' || date +%Y-%m-%d)
        local note_title=$(echo "$filename" | sed 's/^[0-9-]* - //' | sed 's/\.md$//')
        
        echo -e "   📝 ${filename}"
        
        # Send to GTM Brain API
        local response=$(curl -s -X POST "$API_URL" \
            -H "Content-Type: application/json" \
            -d "{
                \"blEmail\": \"$user_email\",
                \"accountName\": \"$account_folder\",
                \"noteTitle\": \"$note_title\",
                \"noteDate\": \"$note_date\",
                \"content\": $(echo "$content" | jq -Rs .),
                \"notePath\": \"$relative_path\"
            }" 2>/dev/null)
        
        if echo "$response" | grep -q '"success":true'; then
            echo -e "      ${GREEN}✓ Synced${NC}"
            notes_synced=$((notes_synced + 1))
        else
            echo -e "      ${YELLOW}⚠ Skipped (may already be synced)${NC}"
        fi
        
    done < <(find "$meetings_path" -name "*.md" -mtime -7 -type f -print0 2>/dev/null)
    
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "   Notes found: $notes_found"
    echo -e "   Notes synced: ${GREEN}$notes_synced${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

echo -e "${BLUE}[1/3]${NC} Finding Obsidian vault..."

VAULT_PATH=$(find_vault)

if [ -z "$VAULT_PATH" ]; then
    echo -e "${YELLOW}   ⚠ Could not find Obsidian vault automatically${NC}"
    echo ""
    echo "   Please enter the path to your vault:"
    echo "   (e.g., /Users/yourname/Documents/Eudia Meetings)"
    echo ""
    read -p "   Vault path: " VAULT_PATH
    
    if [ ! -d "$VAULT_PATH" ]; then
        echo -e "${RED}   ✗ Folder not found${NC}"
        echo ""
        read -p "   Press Enter to exit..."
        exit 1
    fi
fi

echo -e "${GREEN}   ✓ Found vault: $VAULT_PATH${NC}"

echo ""
echo -e "${BLUE}[2/3]${NC} Getting user info..."

USER_EMAIL=$(get_user_email)
echo -e "${GREEN}   ✓ User: $USER_EMAIL${NC}"

echo ""
echo -e "${BLUE}[3/3]${NC} Syncing notes..."
echo ""

sync_notes "$VAULT_PATH" "$USER_EMAIL"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     ${BOLD}✓ SYNC COMPLETE${NC}                                              ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     Your notes are now in GTM Brain Meeting Prep.                 ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     They will also sync to Salesforce automatically.              ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

read -p "   Press Enter to close..."

