import type {MCPServerConfig} from '../mcp.js'
import {MCPServerFactory, type MCPServerCredentials} from './server-factory.js'

/**
 * Datadog MCP Server Factory
 */
export class DatadogMCPFactory extends MCPServerFactory {
  getId(): string {
    return 'datadog'
  }

  getName(): string {
    return 'Datadog MCP'
  }

  getAllowedTools(): string[] {
    return ['get_dashboard', 'search_monitors', 'get_metrics']
  }

  isCredentialsValid(credentials: MCPServerCredentials): boolean {
    return !!credentials.apiKey && !!credentials.appKey
  }

  createServerConfig(credentials: MCPServerCredentials): MCPServerConfig {
    this.validateCredentials(credentials, ['apiKey', 'appKey'])

    return {
      id: 'datadog',
      name: 'Datadog MCP',
      type: 'http',
      url: 'https://mcp.datadoghq.com/api/unstable/mcp-server/mcp',
      headers: {
        DD_API_KEY: credentials.apiKey,
        DD_APPLICATION_KEY: credentials.appKey,
      },
      priority: 3,
    }
  }
}
