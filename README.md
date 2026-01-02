# Roll20 MCP Server

A Model Context Protocol (MCP) server that interfaces with Roll20 via a Chrome extension, allowing AI assistants like Claude to manage your Roll20 campaigns programmatically.

## Architecture

```
┌─────────┐     MCP      ┌─────────────┐   Native    ┌──────────────┐   Content   ┌─────────┐
│ Claude  │ ◄─────────► │  MCP Server │  Messaging  │  Extension   │   Script    │ Roll20  │
│ Desktop │   stdio     │  (Node.js)  │ ◄─────────► │  Background  │ ◄─────────► │   Tab   │
└─────────┘             └─────────────┘   JSON-RPC  └──────────────┘   Messages  └─────────┘
```

## Features

- **Character Management**: Create, read, update characters in your campaign
- **Handout Management**: Create and manage campaign handouts
- **Campaign Information**: Query campaign details and statistics
- **Real-time**: Works with live Roll20 sessions
- **Full Access**: Uses Roll20's internal JavaScript API (not the limited Mod API)

## Available MCP Tools

1. `list_characters` - List all characters in the campaign
2. `get_character` - Get detailed character information
3. `create_character` - Create a new character
4. `update_character` - Update an existing character
5. `list_handouts` - List all handouts
6. `create_handout` - Create a new handout
7. `get_campaign_info` - Get campaign statistics

## Requirements

- Node.js 18+
- Google Chrome or Chromium
- Active Roll20 campaign (tab must be open)
- Claude Desktop (or another MCP client)

## Installation

### Step 1: Install Dependencies

```bash
npm install
npm run build
```

### Step 2: Install Chrome Extension

1. Open Chrome and navigate to `chrome://extensions`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `extension` folder from this project
5. **Copy the Extension ID** (it will look like: `abcdefghijklmnopqrstuvwxyz123456`)

### Step 3: Configure Native Messaging

#### On Linux/Mac:

```bash
./install-native-host.sh
```

#### On Windows:

```cmd
install-native-host.bat
```

### Step 4: Update Extension ID

After running the install script, you need to update the native messaging host manifest with your actual extension ID:

#### Linux:
Edit `~/.config/google-chrome/NativeMessagingHosts/com.roll20.mcp.host.json`

#### Mac:
Edit `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.roll20.mcp.host.json`

#### Windows:
Edit the file path shown in the install script output (typically in `%TEMP%`)

Replace `EXTENSION_ID_PLACEHOLDER` with your actual extension ID from Step 2.

### Step 5: Configure Claude Desktop

Add to your Claude Desktop configuration file:

#### Mac:
`~/Library/Application Support/Claude/claude_desktop_config.json`

#### Windows:
`%APPDATA%\Claude\claude_desktop_config.json`

#### Linux:
`~/.config/Claude/claude_desktop_config.json`

Add this configuration:

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

**Important**: Replace `/absolute/path/to/DND_MCP` with the actual absolute path to this project.

### Step 6: Restart and Test

1. Restart Claude Desktop
2. Open a Roll20 campaign in Chrome
3. Wait for the extension to connect (check Chrome DevTools console)
4. In Claude, try: "List my Roll20 characters"

## Usage Examples

Once configured, you can interact with your Roll20 campaign through Claude:

**List characters:**
```
Show me all characters in my Roll20 campaign
```

**Create a character:**
```
Create a new character named "Gandalf the Grey" with bio "A wise wizard"
```

**Get character details:**
```
Get details for character ID abc123
```

**Create a handout:**
```
Create a handout called "Session Notes" with content "Today we explored the dungeon"
```

**Get campaign info:**
```
What's the status of my Roll20 campaign?
```

## Troubleshooting

### Extension Not Connecting

1. Check Chrome DevTools console (F12) on the Roll20 tab
2. Look for "[Page Script] Roll20 API detected and ready!"
3. Check the background service worker console in `chrome://extensions`

### Native Messaging Errors

1. Verify the native messaging manifest has the correct extension ID
2. Check that the path to `build/index.js` is absolute and correct
3. Ensure Node.js is in your system PATH
4. Check MCP server logs: `~/.claude/logs/mcp-server-roll20.log` (or similar)

### Roll20 API Not Available

- Ensure you're on the Roll20 editor page (`app.roll20.net/editor/*`)
- Wait a few seconds for Roll20 to fully load
- Refresh the page if needed

### Permission Errors

- On Linux/Mac, ensure `install-native-host.sh` is executable: `chmod +x install-native-host.sh`
- On Windows, you may need to run the command prompt as Administrator

## Development

### Project Structure

```
DND_MCP/
├── src/
│   └── index.ts          # MCP server implementation
├── extension/
│   ├── manifest.json     # Chrome extension manifest
│   ├── background.js     # Background service worker
│   ├── content-script.js # Content script (isolated context)
│   └── page-script.js    # Page script (Roll20 API access)
├── build/                # Compiled TypeScript output
└── package.json
```

### Building

```bash
npm run build     # Compile TypeScript
npm run watch     # Watch mode for development
npm run dev       # Build and run server
```

### Debugging

**Extension Debugging:**
1. Go to `chrome://extensions`
2. Find "Roll20 MCP Bridge"
3. Click "Inspect views: background page"
4. Also open DevTools on the Roll20 tab (F12)

**MCP Server Debugging:**
- Server logs to stderr, which Claude Desktop captures
- Check Claude Desktop logs for error messages
- Add `console.error()` statements in `src/index.ts`

## How It Works

1. **Chrome Extension** injects scripts into Roll20 pages
2. **Page Script** accesses Roll20's internal `window.Campaign` object
3. **Content Script** bridges page script and background script
4. **Background Script** uses Native Messaging to communicate with MCP server
5. **MCP Server** exposes tools to Claude Desktop via stdio
6. **Claude** calls tools, which flow through the chain to manipulate Roll20

## Security Considerations

- The extension only works on Roll20 domains
- Native Messaging restricts communication to your specific extension ID
- The MCP server only accepts commands from Claude Desktop
- All communication is local to your machine

## Known Limitations

- Roll20 tab must be open and loaded
- Changes are immediate (no undo through this interface)
- Some advanced Roll20 features not yet supported
- Character sheet attributes are read-only (currently)

## Future Enhancements

- [ ] Token manipulation (move, create, delete)
- [ ] Map/page management
- [ ] Dice rolling integration
- [ ] Chat message sending
- [ ] Character sheet attribute editing
- [ ] Macro creation and management
- [ ] Combat tracker integration

## Credits

Inspired by [Beyond20](https://github.com/kakaroto/Beyond20) by kakaroto, which demonstrated the viability of accessing Roll20's internal API through Chrome extensions.

## License

MIT License - See LICENSE file for details

## Contributing

Contributions welcome! Please open an issue or PR.
