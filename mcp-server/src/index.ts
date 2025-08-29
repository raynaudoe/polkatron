#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  Prompt,
} from '@modelcontextprotocol/sdk/types.js';
import { OrchestratorTool } from './orchestratorTool.js';
import { InitializeTool } from './initializeTool.js';

// Simple logger that writes to stderr
const logger = {
  info: (msg: string, ...args: any[]) => console.error(`[INFO] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => console.error(`[WARN] ${msg}`, ...args),
  debug: (msg: string, ...args: any[]) => {} // Silent in production
};

const orchestratorTool = new OrchestratorTool(logger as any);
const initializeTool = new InitializeTool(logger as any);

const tools: Tool[] = [
  {
    name: 'initialize',
    description: 'Initialize a project with required directories, subagent files, and scripts for SDK upgrades. Run this before using sdk_upgrade.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Path to the project directory to initialize (optional, defaults to sdk-upgrade subdirectory)'
        }
      },
      required: []
    }
  },
  {
    name: 'sdk_upgrade',
    description: 'Upgrade Polkadot SDK from one version to another. Returns orchestrator prompt for Claude to execute in main context, allowing it to spawn specialized subagents.',
    inputSchema: {
      type: 'object',
      properties: {
        oldTag: {
          type: 'string',
          description: 'The current SDK version tag (e.g., "polkadot-stable2407")'
        },
        newTag: {
          type: 'string',
          description: 'The target SDK version tag (e.g., "polkadot-stable2409")'
        },
        projectPath: {
          type: 'string',
          description: 'Path to the project directory (optional, defaults to current directory)'
        }
      },
      required: ['oldTag', 'newTag']
    }
  }
];

async function startMCPServer() {
  const server = new Server(
    {
      name: 'sdk-upgrader',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        prompts: {
          listChanged: true
        }
      }
    }
  );

  // Define prompts that appear as slash commands
  const prompts: Prompt[] = [
    {
      name: 'initialize',
      description: 'Initialize project structure for SDK upgrades',
      arguments: [
        {
          name: 'projectPath',
          description: 'Path to project directory (optional, defaults to sdk-upgrade subdirectory)',
          required: false
        }
      ]
    },
    {
      name: 'sdk_upgrade',
      description: 'Upgrade Polkadot SDK from one version to another',
      arguments: [
        {
          name: 'oldTag',
          description: 'Current SDK version (e.g., polkadot-stable2407)',
          required: true
        },
        {
          name: 'newTag',
          description: 'Target SDK version (e.g., polkadot-stable2409)',
          required: true
        }
      ]
    }
  ];

  // Handle prompts/list request
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts
  }));

  // Handle prompts/get request
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    switch (name) {
      case 'initialize':
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Use the initialize MCP tool to set up the project structure for SDK upgrades${args?.projectPath ? ` in ${args.projectPath}` : ''}.`
              }
            }
          ]
        };
      
      case 'sdk_upgrade':
        if (!args?.oldTag || !args?.newTag) {
          throw new Error('oldTag and newTag are required for sdk_upgrade');
        }
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Use the sdk_upgrade MCP tool to upgrade from ${args.oldTag} to ${args.newTag}.`
              }
            }
          ]
        };
      
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: any;

      switch (name) {
        case 'initialize':
          result = await initializeTool.execute(args as any);
          break;
        case 'sdk_upgrade':
          result = await orchestratorTool.execute(args as any);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      // Handle the response based on what the tool returns
      if (result.success && result.prompt) {
        // Return the orchestrator prompt for Claude to execute
        return {
          content: [
            {
              type: 'text',
              text: `${result.prompt}\n\n---\n\n${result.config.instruction}`
            }
          ]
        };
      } else if (result.success && result.created) {
        // Initialize tool response
        const createdList = result.created?.join('\n') || '';
        return {
          content: [
            {
              type: 'text',
              text: `${result.message}\n\nCreated:\n${createdList}`
            }
          ]
        };
      } else if (result.success) {
        return {
          content: [
            {
              type: 'text',
              text: result.output || result.message || 'Operation completed successfully'
            }
          ]
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${result.error}`
            }
          ],
          isError: true
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Tool execution failed: ${name}`, errorMessage);
      
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Log startup message to stderr
  console.error('SDK Upgrader MCP Server running on stdio');

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.error('Received SIGINT, shutting down');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.error('Received SIGTERM, shutting down');
    process.exit(0);
  });
}

// Start the MCP server
startMCPServer().catch((error) => {
  console.error('Failed to start MCP server:', error);  
  process.exit(1);
});