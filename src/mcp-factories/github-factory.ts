import type {MCPServerConfig} from '../mcp.js'
import {MCPServerFactory, type MCPServerCredentials} from './server-factory.js'

/**
 * GitHub MCP Server Factory
 */
export class GitHubMCPFactory extends MCPServerFactory {
  getId(): string {
    return 'github'
  }

  getName(): string {
    return 'GitHub MCP'
  }

  getAllowedTools(): string[] {
    return ['search_issues', 'issue_read', 'search_code', 'search_pull_requests']
  }

  isCredentialsValid(credentials: MCPServerCredentials): boolean {
    return !!credentials.token
  }

  createServerConfig(credentials: MCPServerCredentials): MCPServerConfig {
    this.validateCredentials(credentials, ['token'])

    return {
      id: 'github',
      name: 'GitHub MCP',
      type: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
      headers: {
        Authorization: `Bearer ${credentials.token}`,
        'X-MCP-Readonly': 'true',
      },
      readonly: true,
      priority: 1,
    }
  }
}
