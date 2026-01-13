#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# EUDIA MEETING SYNC - One-Click Installer for Sales Reps
# ═══════════════════════════════════════════════════════════════════════════════
# Double-click this file to install and configure.
# No technical knowledge required!
# ═══════════════════════════════════════════════════════════════════════════════

# Colors for better UX
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

clear

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}                                                                   ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}        ${BOLD}EUDIA MEETING SYNC${NC} - Hyprnote → Salesforce               ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                                   ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}        Automatically sync your meeting notes to Salesforce        ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                                   ${CYAN}║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1: Check for Node.js
# ═══════════════════════════════════════════════════════════════════════════════
echo -e "${BLUE}[1/5]${NC} Checking for Node.js..."

if ! command -v node &> /dev/null; then
    echo ""
    echo -e "${YELLOW}⚠  Node.js is not installed${NC}"
    echo ""
    echo "   Node.js is required to run this tool."
    echo ""
    
    # Check if Homebrew is available
    if command -v brew &> /dev/null; then
        echo -e "${CYAN}   Installing Node.js via Homebrew...${NC}"
        brew install node
        if [ $? -ne 0 ]; then
            echo -e "${RED}   ✗ Homebrew installation failed${NC}"
            echo ""
            echo "   Please install Node.js manually:"
            echo "   1. Go to: https://nodejs.org"
            echo "   2. Download and install the LTS version"
            echo "   3. Double-click this file again"
            echo ""
            read -p "   Press Enter to open the download page..."
            open "https://nodejs.org/en/download/"
            exit 1
        fi
    else
        echo "   Please install Node.js:"
        echo "   1. Go to: https://nodejs.org"
        echo "   2. Download and install the LTS version (the big green button)"
        echo "   3. Double-click this file again"
        echo ""
        read -p "   Press Enter to open the download page..."
        open "https://nodejs.org/en/download/"
        exit 1
    fi
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}   ✓ Node.js installed: ${NODE_VERSION}${NC}"

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2: Install dependencies
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BLUE}[2/5]${NC} Installing required packages..."

npm install --silent 2>&1 | grep -v "^npm" | head -5

if [ $? -ne 0 ]; then
    echo -e "${RED}   ✗ Package installation failed${NC}"
    echo ""
    echo "   Please contact RevOps (Keigan) for help."
    echo ""
    read -p "   Press Enter to exit..."
    exit 1
fi

echo -e "${GREEN}   ✓ Packages installed${NC}"

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3: Check for Hyprnote
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BLUE}[3/5]${NC} Looking for Hyprnote..."

# Use node to find Hyprnote database (uses our enhanced detection)
HYPRNOTE_CHECK=$(node -e "
const hyprnote = require('./lib/hyprnote');
const db = hyprnote.findDatabase();
if (db) {
  console.log('FOUND:' + db.version + ':' + db.path);
} else {
  console.log('NOT_FOUND');
}
" 2>/dev/null)

if [[ "$HYPRNOTE_CHECK" == NOT_FOUND ]]; then
    echo ""
    echo -e "${YELLOW}⚠  Hyprnote database not found${NC}"
    echo ""
    echo "   To fix this:"
    echo "   1. Make sure Hyprnote is installed (https://hyprnote.com)"
    echo "   2. Open Hyprnote and record at least one test meeting"
    echo "   3. Then double-click this file again"
    echo ""
    
    # Show where we looked
    echo "   Searched locations:"
    echo "   • ~/Library/Application Support/com.hyprnote.stable/"
    echo "   • ~/Library/Application Support/com.hyprnote.nightly/"
    echo "   • ~/Library/Application Support/com.hyprnote.app/"
    echo "   • ~/Library/Application Support/*hyprnote*/ (dynamic scan)"
    echo ""
    
    read -p "   Press Enter to exit..."
    exit 1
else
    HYPRNOTE_VERSION=$(echo "$HYPRNOTE_CHECK" | cut -d: -f2)
    HYPRNOTE_PATH=$(echo "$HYPRNOTE_CHECK" | cut -d: -f3-)
    echo -e "${GREEN}   ✓ Found Hyprnote: ${HYPRNOTE_VERSION}${NC}"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 4: Configure your profile
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BLUE}[4/5]${NC} Setting up your profile..."
echo ""

# Check if already configured
if [ -f "data/config.json" ]; then
    EXISTING_NAME=$(node -e "const c = require('./data/config.json'); console.log(c.rep?.name || 'Unknown');" 2>/dev/null)
    echo -e "${CYAN}   Current user: ${EXISTING_NAME}${NC}"
    echo ""
    read -p "   Keep this profile? (Y/n): " KEEP_PROFILE
    
    if [[ "$KEEP_PROFILE" =~ ^[Nn] ]]; then
        echo ""
        node setup-quick.js
    else
        echo -e "${GREEN}   ✓ Keeping existing profile${NC}"
    fi
else
    node setup-quick.js
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 5: Create Desktop shortcuts
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BLUE}[5/5]${NC} Creating Desktop shortcuts..."

DESKTOP="$HOME/Desktop"

# Create "Sync Meetings" shortcut
SYNC_SHORTCUT="$DESKTOP/Sync Meetings.command"
cat > "$SYNC_SHORTCUT" << 'SYNCEOF'
#!/bin/bash
# Quick sync - double-click to sync your meetings
cd "$(dirname "$0")/../Documents/hyprnote-sync" 2>/dev/null || cd "SCRIPT_DIR_PLACEHOLDER"
clear
echo ""
echo "  ╔═════════════════════════════════════════╗"
echo "  ║      SYNCING YOUR MEETING NOTES         ║"
echo "  ╚═════════════════════════════════════════╝"
echo ""
npm run sync
echo ""
read -p "  Press Enter to close..."
SYNCEOF

# Replace placeholder with actual path
sed -i '' "s|SCRIPT_DIR_PLACEHOLDER|$SCRIPT_DIR|g" "$SYNC_SHORTCUT"
chmod +x "$SYNC_SHORTCUT"

echo -e "${GREEN}   ✓ Created: 'Sync Meetings' on Desktop${NC}"

# ═══════════════════════════════════════════════════════════════════════════════
# COMPLETE!
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     ${BOLD}✓ SETUP COMPLETE!${NC}                                            ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     Your meeting notes will now sync to Salesforce.               ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     ${BOLD}HOW TO USE:${NC}                                                  ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     1. Record meetings in Hyprnote as usual                       ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     2. After your calls, double-click 'Sync Meetings'             ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}        on your Desktop                                            ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     3. Notes appear on the Account in Salesforce!                 ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     ${BOLD}TIPS:${NC}                                                        ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     • Connect your calendar in Hyprnote for better matching       ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     • Include account names in meeting titles (e.g. "IQVIA Call") ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     • Add participant emails for highest accuracy                 ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                   ${GREEN}║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Offer to sync now
read -p "   Would you like to sync now? (Y/n): " SYNC_NOW

if [[ ! "$SYNC_NOW" =~ ^[Nn] ]]; then
    echo ""
    npm run sync
fi

echo ""
read -p "   Press Enter to close..."

