#!/bin/bash

# Installation script for Roll20 MCP Native Messaging Host
# This script configures Chrome to communicate with the MCP server

set -e

HOST_NAME="com.roll20.mcp.host"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_PATH="$SCRIPT_DIR/build/index.js"

echo "Installing Roll20 MCP Native Messaging Host..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Build the server
echo "Building MCP server..."
npm install
npm run build

# Verify server was built
if [ ! -f "$SERVER_PATH" ]; then
    echo "Error: Server build failed. $SERVER_PATH not found."
    exit 1
fi

# Create native messaging host manifest
echo "Creating native messaging host manifest..."

# Detect OS and set manifest location
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    MANIFEST_DIR_CHROMIUM="$HOME/.config/chromium/NativeMessagingHosts"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    MANIFEST_DIR_CHROMIUM="$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
else
    echo "Error: Unsupported operating system: $OSTYPE"
    echo "Please manually configure the native messaging host."
    exit 1
fi

# Create manifest directories
mkdir -p "$MANIFEST_DIR"
[ -n "$MANIFEST_DIR_CHROMIUM" ] && mkdir -p "$MANIFEST_DIR_CHROMIUM"

# Generate manifest file
MANIFEST_FILE="$MANIFEST_DIR/$HOST_NAME.json"

cat > "$MANIFEST_FILE" << EOF
{
  "name": "$HOST_NAME",
  "description": "Roll20 MCP Server Native Messaging Host",
  "path": "$SERVER_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://EXTENSION_ID_PLACEHOLDER/"
  ]
}
EOF

echo "Manifest created at: $MANIFEST_FILE"

# Copy for Chromium if applicable
if [ -n "$MANIFEST_DIR_CHROMIUM" ]; then
    cp "$MANIFEST_FILE" "$MANIFEST_DIR_CHROMIUM/$HOST_NAME.json"
    echo "Manifest also copied to: $MANIFEST_DIR_CHROMIUM/$HOST_NAME.json"
fi

echo ""
echo "========================================="
echo "Installation Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Load the Chrome extension from: $SCRIPT_DIR/extension"
echo "2. Get the extension ID from chrome://extensions"
echo "3. Update the manifest file with your extension ID:"
echo "   Edit: $MANIFEST_FILE"
echo "   Replace 'EXTENSION_ID_PLACEHOLDER' with your actual extension ID"
echo ""
echo "4. Reload the extension in Chrome"
echo ""
echo "The native messaging host is now configured!"
echo ""
