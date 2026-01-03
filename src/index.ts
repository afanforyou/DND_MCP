#!/usr/bin/env node

/**
 * Roll20 MCP Server
 * Provides Model Context Protocol tools for managing Roll20 campaigns
 * Communicates with Chrome extension via WebSocket
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer, WebSocket } from 'ws';

// WebSocket Communication with Chrome Extension
class ExtensionClient {
  private wss: WebSocketServer;
  private ws: WebSocket | null = null;
  private requestIdCounter = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  constructor(port: number = 8765) {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws) => {
      console.error('Chrome extension connected via WebSocket');
      this.ws = ws;

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        console.error('Chrome extension disconnected');
        this.ws = null;
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });

    console.error(`WebSocket server listening on ws://localhost:${port}`);
  }

  private handleMessage(message: any) {
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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Chrome extension not connected. Please ensure Roll20 tab is open with extension loaded.');
    }

    const requestId = this.requestIdCounter++;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout: ${method}`));
      }, 30000); // 30 second timeout

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      const message = { requestId, method, params };
      this.ws!.send(JSON.stringify(message));
      console.error('Sent to extension:', JSON.stringify(message));
    });
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

// Initialize WebSocket client for extension communication
const extensionClient = new ExtensionClient(8765);

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
    name: 'get_handout',
    description: 'Get detailed information about a specific handout',
    inputSchema: {
      type: 'object',
      properties: {
        handoutId: {
          type: 'string',
          description: 'The ID of the handout to retrieve',
        },
      },
      required: ['handoutId'],
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
    name: 'update_handout',
    description: 'Update an existing handout',
    inputSchema: {
      type: 'object',
      properties: {
        handoutId: {
          type: 'string',
          description: 'The ID of the handout to update',
        },
        name: {
          type: 'string',
          description: 'New handout name (optional)',
        },
        content: {
          type: 'string',
          description: 'New content/notes (optional)',
        },
        gmnotes: {
          type: 'string',
          description: 'New GM notes (optional)',
        },
      },
      required: ['handoutId'],
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
        result = await extensionClient.sendRequest('listCharacters');
        break;

      case 'get_character':
        result = await extensionClient.sendRequest('getCharacter', {
          characterId: args.characterId,
        });
        break;

      case 'create_character':
        result = await extensionClient.sendRequest('createCharacter', {
          name: args.name,
          data: {
            avatar: args.avatar,
            bio: args.bio,
            gmnotes: args.gmnotes,
          },
        });
        break;

      case 'update_character':
        result = await extensionClient.sendRequest('updateCharacter', {
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
        result = await extensionClient.sendRequest('listHandouts');
        break;

      case 'get_handout':
        result = await extensionClient.sendRequest('getHandout', {
          handoutId: args.handoutId,
        });
        break;

      case 'create_handout':
        result = await extensionClient.sendRequest('createHandout', {
          name: args.name,
          content: args.content || '',
        });
        break;

      case 'update_handout':
        result = await extensionClient.sendRequest('updateHandout', {
          handoutId: args.handoutId,
          updates: {
            name: args.name,
            content: args.content,
            gmnotes: args.gmnotes,
          },
        });
        break;

      case 'get_campaign_info':
        result = await extensionClient.sendRequest('getCampaignInfo');
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
  console.error('WebSocket server ready for Chrome extension connection');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Roll20 MCP Server running on stdio');
  console.error('Waiting for connection from Chrome extension on ws://localhost:8765');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
