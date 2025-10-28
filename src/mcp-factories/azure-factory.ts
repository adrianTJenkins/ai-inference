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

  getAllowedTools(): string[] {
    return ['kusto']
  }

  isCredentialsValid(credentials: MCPServerCredentials): boolean {
    // Azure MCP requires Service Principal authentication
    return !!(credentials.clientId && credentials.clientSecret && credentials.tenantId)
  }

  createServerConfig(credentials: MCPServerCredentials): MCPServerConfig {
    if (!this.isCredentialsValid(credentials)) {
      throw new Error('Azure MCP requires clientId, clientSecret, and tenantId')
    }

    return {
      id: 'azure',
      name: 'Azure MCP',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '--no-update-notifier', '@azure/mcp@latest', 'server', 'start'],
      env: {
        AZURE_CLIENT_ID: credentials.clientId!,
        AZURE_CLIENT_SECRET: credentials.clientSecret!,
        AZURE_TENANT_ID: credentials.tenantId!,
        NO_UPDATE_NOTIFIER: '1',
        NPM_CONFIG_UPDATE_NOTIFIER: 'false',
      },
      priority: 4,
    }
  }
}
