#!/bin/bash
# hyprnote - Double-click to sync your meetings

clear
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │     hyprnote - SYNCING MEETINGS         │"
echo "  └─────────────────────────────────────────┘"
echo ""

node sync.js

echo ""
echo "  ─────────────────────────────────────────"
echo "  Done! Check Salesforce for your notes."
echo ""
read -p "  Press Enter to close..."

