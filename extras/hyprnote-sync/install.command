#!/bin/bash
# hyprnote sync - One-Click Installer
# Double-click this file to install

clear
echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │       hyprnote - QUICK INSTALL          │"
echo "  └─────────────────────────────────────────┘"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "  Node.js not found. Opening download page..."
    open "https://nodejs.org/en/download/"
    echo ""
    echo "  Please install Node.js, then double-click this file again."
    echo ""
    read -p "  Press Enter to exit..."
    exit 1
fi

echo "  ✓ Node.js found"

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Install dependencies
echo "  Installing dependencies..."
npm install --silent 2>/dev/null

if [ $? -ne 0 ]; then
    echo "  ✗ Installation failed. Please contact admin."
    read -p "  Press Enter to exit..."
    exit 1
fi

echo "  ✓ Dependencies installed"
echo ""

# Run setup
echo "  Starting setup..."
echo ""
node setup-quick.js

# Enable auto-sync (every 3 hours)
echo ""
echo "  Enabling auto-sync (every 3 hours)..."
node auto-sync.js --install 2>/dev/null

echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │  SETUP COMPLETE                         │"
echo "  │                                         │"
echo "  │  Meetings sync automatically every 3h   │"
echo "  │  Internal meetings are skipped          │"
echo "  └─────────────────────────────────────────┘"
echo ""
read -p "  Press Enter to close..."

