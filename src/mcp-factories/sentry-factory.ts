import type {MCPServerConfig} from '../mcp.js'
import {MCPServerFactory, type MCPServerCredentials} from './server-factory.js'

/**
 * Sentry MCP Server Factory
 */
export class SentryMCPFactory extends MCPServerFactory {
  getId(): string {
    return 'sentry'
  }

  getName(): string {
    return 'Sentry MCP'
  }

  isCredentialsValid(credentials: MCPServerCredentials): boolean {
    return !!credentials.token
  }

  createServerConfig(credentials: MCPServerCredentials): MCPServerConfig {
    this.validateCredentials(credentials, ['token'])

    return {
      id: 'sentry',
      name: 'Sentry MCP',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '--no-update-notifier', '@sentry/mcp-server@latest', '--host=github.sentry.io'],
      env: {
        SENTRY_ACCESS_TOKEN: credentials.token,
        SENTRY_HOST: 'github.sentry.io',
        NO_UPDATE_NOTIFIER: '1',
        NPM_CONFIG_UPDATE_NOTIFIER: 'false',
      },
      priority: 2,
    }
  }
}
