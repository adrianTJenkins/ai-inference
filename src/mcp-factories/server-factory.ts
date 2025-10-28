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
  abstract getAllowedTools(): string[]

  protected validateCredentials(credentials: MCPServerCredentials, requiredFields: string[]): void {
    for (const field of requiredFields) {
      if (!credentials[field]) {
        throw new Error(`${this.getName()} requires ${field}`)
      }
    }
  }
}

/**
 * Server availability status
 */
export interface ServerAvailability {
  serverId: string
  serverName: string
  status: 'available' | 'credentials-missing' | 'connection-failed' | 'invalid-credentials'
  reason?: string
  config?: MCPServerConfig
  lastChecked?: Date
}

/**
 * Enhanced configuration result with availability information
 */
export interface ConfigurationResult {
  available: MCPServerConfig[]
  unavailable: ServerAvailability[]
  summary: {
    total: number
    available: number
    unavailable: number
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

  /**
   * Create server configurations with detailed availability reporting
   */
  createConfigsWithAvailability(credentialsMap: Map<string, MCPServerCredentials>): ConfigurationResult {
    const available: MCPServerConfig[] = []
    const unavailable: ServerAvailability[] = []

    for (const factory of this.getAllFactories()) {
      const serverId = factory.getId()
      const serverName = factory.getName()
      let credentials = credentialsMap.get(serverId)

      if (!credentials) {
        // Check if this server requires credentials by testing with empty credentials
        if (factory.isCredentialsValid({})) {
          // Server doesn't require credentials, use empty credentials
          credentials = {}
        } else {
          unavailable.push({
            serverId,
            serverName,
            status: 'credentials-missing',
            reason: `No credentials provided for ${serverName}`,
            lastChecked: new Date(),
          })
          continue
        }
      }

      if (!factory.isCredentialsValid(credentials)) {
        unavailable.push({
          serverId,
          serverName,
          status: 'invalid-credentials',
          reason: `Invalid credentials for ${serverName}`,
          lastChecked: new Date(),
        })
        continue
      }

      try {
        const config = factory.createServerConfig(credentials)
        available.push(config)

        core.info(`✅ ${serverName} server available`)
      } catch (error) {
        unavailable.push({
          serverId,
          serverName,
          status: 'connection-failed',
          reason: `Failed to create config: ${error}`,
          lastChecked: new Date(),
        })
        core.warning(`❌ Failed to configure ${serverName}: ${error}`)
      }
    }

    // Sort available configs by priority
    available.sort((a, b) => (a.priority || 999) - (b.priority || 999))

    // Log summary
    const summary = {
      total: this.getAllFactories().length,
      available: available.length,
      unavailable: unavailable.length,
    }

    if (unavailable.length > 0) {
      core.info(
        `📊 Server availability: ${summary.available}/${summary.total} servers available. ` +
          `Unavailable: ${unavailable.map(u => u.serverId).join(', ')}`,
      )
    } else {
      core.info(`🎉 All ${summary.total} servers are available`)
    }

    return {available, unavailable, summary}
  }

  /**
   * Legacy method for backward compatibility
   * (Now wraps the enhanced method)
   */
  createConfigs(credentialsMap: Map<string, MCPServerCredentials>): MCPServerConfig[] {
    const result = this.createConfigsWithAvailability(credentialsMap)
    return result.available
  }

  /**
   * Get list of servers that require credentials
   */
  getRequiredCredentials(): Map<string, string[]> {
    const requirements = new Map<string, string[]>()

    for (const factory of this.getAllFactories()) {
      // This is a simple heuristic - in a real implementation,
      // factories could expose their required credential fields
      const serverId = factory.getId()

      // Test with empty credentials to see what's required
      try {
        factory.createServerConfig({})
      } catch (error) {
        // Parse error message to extract required fields
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes('requires')) {
          // Extract field name from error like "GitHub MCP requires token"
          const match = errorMessage.match(/requires (\w+)/)
          if (match) {
            requirements.set(serverId, [match[1]])
          }
        }
      }
    }

    return requirements
  }

  /**
   * Check if sufficient servers are available for basic operation
   */
  hasMinimumServers(result: ConfigurationResult, minRequired = 1): boolean {
    return result.available.length >= minRequired
  }
}
