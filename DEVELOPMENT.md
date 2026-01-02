# Development Guide

Guide for developers who want to extend or modify the Roll20 MCP Server.

## Architecture Deep Dive

### Communication Flow

```
Claude Desktop (MCP Client)
    ↓ stdio
MCP Server (Node.js)
    ↓ Native Messaging (stdin/stdout binary protocol)
Chrome Extension Background Script
    ↓ chrome.runtime.sendMessage
Content Script (isolated world)
    ↓ window.postMessage
Page Script (main world)
    ↓ Direct access
Roll20 Internal API (window.Campaign, etc.)
```

### Component Responsibilities

#### 1. MCP Server (`src/index.ts`)

**Responsibilities:**
- Implements MCP protocol via `@modelcontextprotocol/sdk`
- Exposes tools to Claude
- Manages Native Messaging binary protocol
- Routes requests to Chrome extension

**Key Classes:**
- `NativeMessagingClient` - Handles binary stdin/stdout communication
- Tool handlers - Map MCP tool calls to extension requests

**Adding a New Tool:**

```typescript
// 1. Add to TOOLS array
const TOOLS = [
  // ...
  {
    name: 'my_new_tool',
    description: 'Does something cool',
    inputSchema: {
      type: 'object',
      properties: {
        param1: {
          type: 'string',
          description: 'A parameter',
        },
      },
      required: ['param1'],
    },
  },
];

// 2. Add handler in CallToolRequestSchema
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    // ...
    case 'my_new_tool':
      result = await nativeClient.sendRequest('myNewMethod', {
        param1: args.param1,
      });
      break;
  }
  // ...
});
```

#### 2. Chrome Extension Background Script (`extension/background.js`)

**Responsibilities:**
- Maintains Native Messaging connection to MCP server
- Routes messages between server and content scripts
- Manages connection lifecycle

**Key Functions:**
- `connectNative()` - Establishes native messaging port
- Message listeners - Forward between native host and content scripts

**Adding Background Logic:**

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MY_NEW_TYPE') {
    // Handle new message type
    // ...
  }
});
```

#### 3. Content Script (`extension/content-script.js`)

**Responsibilities:**
- Bridges isolated extension world with page world
- Injects page script
- Relays messages via `window.postMessage`

**Note:** Content scripts run in an isolated JavaScript context and cannot access page variables like `window.Campaign`.

#### 4. Page Script (`extension/page-script.js`)

**Responsibilities:**
- Accesses Roll20's internal JavaScript API
- Implements Roll20 operations
- Sends results back via `window.postMessage`

**Adding a New Roll20 Operation:**

```javascript
// In Roll20API object
const Roll20API = {
  // ...
  myNewOperation(params) {
    try {
      // Access Roll20 API
      const result = window.Campaign.someMethod(params);

      return { success: true, data: result };
    } catch (error) {
      throw new Error(`Operation failed: ${error.message}`);
    }
  }
};

// In message handler
window.addEventListener('message', async (event) => {
  // ...
  switch (method) {
    // ...
    case 'myNewMethod':
      result = Roll20API.myNewOperation(params);
      break;
  }
});
```

## Roll20 Internal API Reference

### Available Objects

Based on Beyond20 research and testing:

#### `window.Campaign`

Main campaign object with collections:

```javascript
// Collections
Campaign.characters  // Backbone.Collection of characters
Campaign.handouts    // Backbone.Collection of handouts
Campaign.pages       // Backbone.Collection of pages/maps
Campaign.players     // Collection of players

// Methods
Campaign.activePage()           // Get current page
Campaign.save()                 // Save campaign changes
Campaign.get(attr)              // Get attribute
Campaign.set(attr, value)       // Set attribute
```

#### Character Object

```javascript
// Properties
character.id
character.attributes.name
character.attributes.avatar
character.attributes.bio
character.attributes.gmnotes
character.attributes.controlledby
character.attributes.inplayerjournals

// Attributes collection
character.attribs                           // Collection of attributes
character.attribs.find(fn)                  // Find attribute
character.updateTokensByName(name, id)      // Update tokens

// Attribute operations
attribute.set('current', value)
attribute.set('max', value)
attribute.save()
```

#### Handout Object

```javascript
// Properties
handout.id
handout.attributes.name
handout.attributes.notes        // HTML content
handout.attributes.archived
handout.attributes.inplayerjournals

// Methods
handout.save()
```

#### Page Object

```javascript
// Properties
page.id
page.attributes.name
page.thegraphics               // Collection of tokens/graphics

// Graphics (tokens)
graphic.attributes.name
graphic.attributes.left        // X position
graphic.attributes.top         // Y position
graphic.attributes.represents  // Character ID
```

### Common Patterns

#### Finding by Name

```javascript
const character = Campaign.characters.find(
  c => c.attributes.name.toLowerCase().trim() === name.toLowerCase().trim()
);
```

#### Creating Objects

```javascript
const newChar = Campaign.characters.create({
  name: 'Character Name',
  bio: 'Biography',
  // ... other attributes
});
```

#### Updating Objects

```javascript
character.set('name', 'New Name');
character.set('bio', 'New Bio');
character.save();
```

## Testing

### Manual Testing

1. **Build and Run:**
   ```bash
   npm run build
   node build/index.js
   ```

2. **Test Native Messaging:**
   ```bash
   # Send test message (stdin)
   echo '{"requestId":1,"method":"getCampaignInfo","params":{}}' | node build/index.js
   ```

3. **Test Extension:**
   - Open `chrome://extensions`
   - Click "Inspect views: background page"
   - Check console for connection messages
   - Open DevTools on Roll20 tab
   - Check for `[Page Script]` messages

### Debug Logging

**MCP Server:**
```typescript
console.error('Debug message'); // Goes to stderr (Claude captures this)
```

**Extension:**
```javascript
console.log('[Background] Debug message');  // Background console
console.log('[Content Script] Message');    // Page console
console.log('[Page Script] Message');       // Page console
```

### Common Issues

**"Campaign is not defined"**
- Roll20 hasn't loaded yet
- Add retry logic or wait for DOM ready

**"Native messaging host disconnected"**
- Check extension ID in manifest
- Verify path to build/index.js is absolute
- Check Node.js is in PATH

**"postMessage not working"**
- Verify origin is '*' or correct origin
- Check message structure matches expected format

## Adding New Features

### Example: Add Dice Rolling

**1. Add to page-script.js:**

```javascript
const Roll20API = {
  // ...
  rollDice(formula) {
    try {
      // Use Roll20's dice engine
      const result = d20.dice.roll(formula);

      return {
        formula: formula,
        total: result.total,
        rolls: result.rolls
      };
    } catch (error) {
      throw new Error(`Dice roll failed: ${error.message}`);
    }
  }
};

// In message handler
case 'rollDice':
  result = Roll20API.rollDice(params.formula);
  break;
```

**2. Add MCP tool in src/index.ts:**

```typescript
const TOOLS = [
  // ...
  {
    name: 'roll_dice',
    description: 'Roll dice using Roll20 dice engine',
    inputSchema: {
      type: 'object',
      properties: {
        formula: {
          type: 'string',
          description: 'Dice formula (e.g., "2d20+5")',
        },
      },
      required: ['formula'],
    },
  },
];

// In handler
case 'roll_dice':
  result = await nativeClient.sendRequest('rollDice', {
    formula: args.formula,
  });
  break;
```

**3. Test:**
```
In Claude: "Roll 2d20+5 in my Roll20 campaign"
```

## Best Practices

1. **Error Handling**: Always wrap Roll20 API calls in try-catch
2. **Null Checks**: Verify objects exist before accessing
3. **Async Operations**: Use promises for creation/deletion
4. **Logging**: Add debug logs at each communication boundary
5. **Validation**: Validate input before sending to Roll20

## Resources

- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
- [Chrome Native Messaging](https://developer.chrome.com/docs/apps/nativeMessaging/)
- [Beyond20 Source](https://github.com/kakaroto/Beyond20)
- [Roll20 Mod API](https://wiki.roll20.net/API) (different from internal API, but useful reference)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

Include:
- Description of changes
- Test results
- Any new dependencies
- Updated documentation
