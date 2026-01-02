# Quick Start Guide

Get up and running with Roll20 MCP Server in 10 minutes.

## Prerequisites Checklist

- [ ] Node.js 18 or higher installed (`node --version`)
- [ ] Google Chrome installed
- [ ] Claude Desktop installed
- [ ] Active Roll20 account and campaign

## Installation Steps

### 1. Clone and Build (2 minutes)

```bash
cd DND_MCP
npm install
npm run build
```

### 2. Install Chrome Extension (2 minutes)

1. Open Chrome: `chrome://extensions`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Navigate to and select the `extension` folder
5. **IMPORTANT**: Copy the extension ID (looks like `abcdefghijklmnop...`)

### 3. Setup Native Messaging (3 minutes)

**Linux/Mac:**
```bash
./install-native-host.sh
```

**Windows:**
```cmd
install-native-host.bat
```

The script will show you where the manifest file was created.

### 4. Update Extension ID (1 minute)

Open the manifest file shown by the install script and replace `EXTENSION_ID_PLACEHOLDER` with your actual extension ID from step 2.

**Example:**
```json
{
  "name": "com.roll20.mcp.host",
  "description": "Roll20 MCP Server Native Messaging Host",
  "path": "/home/user/DND_MCP/build/index.js",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://abcdefghijklmnop/"
  ]
}
```

### 5. Configure Claude Desktop (2 minutes)

Find your Claude Desktop config file:
- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Add this (create the file if it doesn't exist):

```json
{
  "mcpServers": {
    "roll20": {
      "command": "node",
      "args": ["/absolute/path/to/DND_MCP/build/index.js"]
    }
  }
}
```

**Replace** `/absolute/path/to/DND_MCP` with the actual path!

To get the absolute path:
- **Linux/Mac**: Run `pwd` in the DND_MCP directory
- **Windows**: Run `cd` in the DND_MCP directory

### 6. Test It! (1 minute)

1. **Restart Claude Desktop** completely (quit and relaunch)
2. Open Chrome and navigate to your Roll20 campaign
3. Click to enter the campaign (you should be on `app.roll20.net/editor/...`)
4. Wait 5 seconds for Roll20 to load
5. In Claude Desktop, type: **"List my Roll20 characters"**

## Expected Result

Claude should respond with a list of characters from your campaign:

```
Here are the characters in your Roll20 campaign:

1. Gandalf the Grey
   ID: -abc123

2. Aragorn
   ID: -def456

Found 2 characters total.
```

## Troubleshooting

### "I don't see the MCP server in Claude"

- Check the config file path is correct
- Ensure you used an **absolute path** (not relative)
- Restart Claude Desktop completely
- Check Claude's logs (usually in `~/.claude/logs/`)

### "Extension shows errors in Chrome"

1. Open Chrome DevTools (F12) on the Roll20 tab
2. Look for messages starting with `[Page Script]` or `[Content Script]`
3. Check the extension's background page: `chrome://extensions` → "Inspect views"

### "Native messaging host error"

1. Verify extension ID in manifest matches Chrome extension ID
2. Check that `build/index.js` exists and path is correct
3. Test Node.js is accessible: `node /path/to/DND_MCP/build/index.js`

### "Roll20 tab not connecting"

- Ensure you're on the **editor page** (`app.roll20.net/editor/*`)
- Refresh the Roll20 page
- Wait for Roll20 to fully load (you should see the toolbar)
- Check DevTools console for "[Page Script] Roll20 API detected and ready!"

## Quick Test Commands

Once working, try these in Claude:

```
List my Roll20 characters
```

```
Create a new character named "Test Character"
```

```
What's the status of my Roll20 campaign?
```

```
List all handouts in my campaign
```

## Next Steps

- Read the full [README.md](README.md) for detailed usage
- Check out the [Development Guide](DEVELOPMENT.md) if you want to extend functionality
- Join discussions and report issues on GitHub

## Still Having Issues?

1. Check the [Troubleshooting section](README.md#troubleshooting) in the README
2. Enable verbose logging in all three components
3. Open a GitHub issue with:
   - Your OS and Node.js version
   - Chrome version
   - Error messages from Chrome DevTools and Claude logs
   - Steps you've completed

## Success? 🎉

You're all set! You can now manage your Roll20 campaign through Claude. Try creating NPCs, managing handouts, and organizing your campaign data using natural language.
