import * as core from '@actions/core'
import type {MCPServerConfig} from '../mcp.js'

/**
 * Credentials interface for MCP server factories
 */
export interface MCPServerCredentials {
  [key: string]: string
}

/**
 * Abstract factory for creating MCP server configurations
 */
export abstract class MCPServerFactory {
  abstract getId(): string
  abstract getName(): string
  abstract isCredentialsValid(credentials: MCPServerCredentials): boolean
  abstract createServerConfig(credentials: MCPServerCredentials): MCPServerConfig

  protected validateCredentials(credentials: MCPServerCredentials, requiredFields: string[]): void {
    for (const field of requiredFields) {
      if (!credentials[field]) {
        throw new Error(`${this.getName()} requires ${field}`)
      }
    }
  }
}

/**
 * Registry for managing MCP server factories
 */
export class MCPServerRegistry {
  private factories = new Map<string, MCPServerFactory>()

  register(factory: MCPServerFactory): void {
    this.factories.set(factory.getId(), factory)
  }

  getFactory(serverId: string): MCPServerFactory | undefined {
    return this.factories.get(serverId)
  }

  getAllFactories(): MCPServerFactory[] {
    return Array.from(this.factories.values())
  }

  createConfigs(credentialsMap: Map<string, MCPServerCredentials>): MCPServerConfig[] {
    const configs: MCPServerConfig[] = []

    for (const factory of this.getAllFactories()) {
      const serverId = factory.getId()
      const credentials = credentialsMap.get(serverId)

      if (credentials && factory.isCredentialsValid(credentials)) {
        try {
          const config = factory.createServerConfig(credentials)
          configs.push(config)
        } catch (error) {
          core.warning(`Failed to create config for ${factory.getName()}: ${error}`)
        }
      }
    }

    // Sort by priority
    return configs.sort((a, b) => (a.priority || 999) - (b.priority || 999))
  }
}
