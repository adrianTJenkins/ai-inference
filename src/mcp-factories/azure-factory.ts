import type {MCPServerConfig} from '../mcp.js'
import {MCPServerFactory, type MCPServerCredentials} from './server-factory.js'

/**
 * Azure MCP Server Factory
 */
export class AzureMCPFactory extends MCPServerFactory {
  getId(): string {
    return 'azure'
  }

  getName(): string {
    return 'Azure MCP'
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isCredentialsValid(_credentials: MCPServerCredentials): boolean {
    // Azure MCP doesn't require specific credentials, always available
    return true
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createServerConfig(_credentials: MCPServerCredentials): MCPServerConfig {
    return {
      id: 'azure',
      name: 'Azure MCP',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '--no-update-notifier', '@azure/mcp@latest', 'server', 'start'],
      env: {
        NO_UPDATE_NOTIFIER: '1',
        NPM_CONFIG_UPDATE_NOTIFIER: 'false',
      },
      priority: 4,
    }
  }
}
