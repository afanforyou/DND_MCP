#!/usr/bin/env node

/**
 * Roll20 MCP Server
 * Provides Model Context Protocol tools for managing Roll20 campaigns
 * Communicates with Chrome extension via Native Messaging
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import * as readline from 'readline';

// Native Messaging Communication
class NativeMessagingClient {
  private requestIdCounter = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  constructor() {
    // Set up binary stdin/stdout for Native Messaging
    if (process.stdin.isTTY) {
      console.error('Warning: stdin is a TTY. Native Messaging requires binary stdin.');
    }

    // Listen for messages from Chrome extension
    this.setupNativeMessageListener();
  }

  private setupNativeMessageListener() {
    let messageLength = 0;
    let messageBuffer = Buffer.alloc(0);
    let readingLength = true;

    process.stdin.on('data', (chunk: Buffer) => {
      messageBuffer = Buffer.concat([messageBuffer, chunk]);

      while (true) {
        if (readingLength) {
          if (messageBuffer.length >= 4) {
            messageLength = messageBuffer.readUInt32LE(0);
            messageBuffer = messageBuffer.slice(4);
            readingLength = false;
          } else {
            break;
          }
        } else {
          if (messageBuffer.length >= messageLength) {
            const messageData = messageBuffer.slice(0, messageLength);
            messageBuffer = messageBuffer.slice(messageLength);
            readingLength = true;

            try {
              const message = JSON.parse(messageData.toString('utf-8'));
              this.handleNativeMessage(message);
            } catch (error) {
              console.error('Error parsing native message:', error);
            }
          } else {
            break;
          }
        }
      }
    });
  }

  private handleNativeMessage(message: any) {
    console.error('Received from extension:', JSON.stringify(message));

    if (message.requestId !== undefined) {
      const pending = this.pendingRequests.get(message.requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.requestId);

        if (message.error) {
          pending.reject(new Error(message.error));
        } else {
          pending.resolve(message.data);
        }
      }
    }
  }

  async sendRequest(method: string, params: any = {}): Promise<any> {
    const requestId = this.requestIdCounter++;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout: ${method}`));
      }, 30000); // 30 second timeout

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      const message = { requestId, method, params };
      this.sendNativeMessage(message);
    });
  }

  private sendNativeMessage(message: any) {
    const messageJson = JSON.stringify(message);
    const messageBuffer = Buffer.from(messageJson, 'utf-8');
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(messageBuffer.length, 0);

    process.stdout.write(lengthBuffer);
    process.stdout.write(messageBuffer);

    console.error('Sent to extension:', messageJson);
  }
}

// Initialize MCP Server
const server = new Server(
  {
    name: 'roll20-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize Native Messaging client
const nativeClient = new NativeMessagingClient();

// Tool Definitions
const TOOLS = [
  {
    name: 'list_characters',
    description: 'List all characters in the Roll20 campaign',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_character',
    description: 'Get detailed information about a specific character',
    inputSchema: {
      type: 'object',
      properties: {
        characterId: {
          type: 'string',
          description: 'The ID of the character to retrieve',
        },
      },
      required: ['characterId'],
    },
  },
  {
    name: 'create_character',
    description: 'Create a new character in the Roll20 campaign',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name of the character',
        },
        avatar: {
          type: 'string',
          description: 'URL to character avatar image (optional)',
        },
        bio: {
          type: 'string',
          description: 'Character biography (optional)',
        },
        gmnotes: {
          type: 'string',
          description: 'GM-only notes (optional)',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_character',
    description: 'Update an existing character',
    inputSchema: {
      type: 'object',
      properties: {
        characterId: {
          type: 'string',
          description: 'The ID of the character to update',
        },
        name: {
          type: 'string',
          description: 'New character name (optional)',
        },
        avatar: {
          type: 'string',
          description: 'New avatar URL (optional)',
        },
        bio: {
          type: 'string',
          description: 'New biography (optional)',
        },
        gmnotes: {
          type: 'string',
          description: 'New GM notes (optional)',
        },
      },
      required: ['characterId'],
    },
  },
  {
    name: 'list_handouts',
    description: 'List all handouts in the Roll20 campaign',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'create_handout',
    description: 'Create a new handout in the Roll20 campaign',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name of the handout',
        },
        content: {
          type: 'string',
          description: 'The content/notes of the handout',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_campaign_info',
    description: 'Get information about the current Roll20 campaign',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    let result;

    switch (name) {
      case 'list_characters':
        result = await nativeClient.sendRequest('listCharacters');
        break;

      case 'get_character':
        result = await nativeClient.sendRequest('getCharacter', {
          characterId: args.characterId,
        });
        break;

      case 'create_character':
        result = await nativeClient.sendRequest('createCharacter', {
          name: args.name,
          data: {
            avatar: args.avatar,
            bio: args.bio,
            gmnotes: args.gmnotes,
          },
        });
        break;

      case 'update_character':
        result = await nativeClient.sendRequest('updateCharacter', {
          characterId: args.characterId,
          updates: {
            name: args.name,
            avatar: args.avatar,
            bio: args.bio,
            gmnotes: args.gmnotes,
          },
        });
        break;

      case 'list_handouts':
        result = await nativeClient.sendRequest('listHandouts');
        break;

      case 'create_handout':
        result = await nativeClient.sendRequest('createHandout', {
          name: args.name,
          content: args.content || '',
        });
        break;

      case 'get_campaign_info':
        result = await nativeClient.sendRequest('getCampaignInfo');
        break;

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${errorMessage}`
    );
  }
});

// Start server
async function main() {
  console.error('Starting Roll20 MCP Server...');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Roll20 MCP Server running');
  console.error('Waiting for connection from Chrome extension...');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
