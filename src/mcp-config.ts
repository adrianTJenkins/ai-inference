import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'
import type {MCPServerConfig} from './mcp.js'

/**
 * Format for MCP server configuration in .mcp.json file
 */
export interface MCPConfigServer {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

/**
 * Format for .mcp.json configuration file
 */
export interface MCPConfigFile {
  mcpServers: Record<string, MCPConfigServer>
}

/**
 * Load MCP server configurations from .mcp.json file
 *
 * @param configPath - Path to the .mcp.json file (defaults to .github/.mcp.json in workspace directory)
 * @returns Array of MCPServerConfig objects
 */
export function loadMCPConfig(configPath?: string): MCPServerConfig[] {
  // For GitHub Actions, look in the .github directory (the repo using the action)
  // Otherwise, fall back to .github in current working directory
  const workspaceDir = process.env.GITHUB_WORKSPACE || process.cwd()
  const filePath = configPath || path.join(workspaceDir, '.github', '.mcp.json')

  if (!fs.existsSync(filePath)) {
    core.info(`No .mcp.json file found at ${filePath}`)
    return []
  }

  try {
    core.info(`Loading MCP configuration from ${filePath}`)
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const config: MCPConfigFile = JSON.parse(fileContent)

    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      core.warning('Invalid .mcp.json format: mcpServers key is missing or not an object')
      return []
    }

    // Process config with environment variable substitution
    const processedConfig = processConfigWithEnvVars(config)

    const serverConfigs: MCPServerConfig[] = []
    let priority = 1

    for (const [serverName, serverConfig] of Object.entries(processedConfig.mcpServers)) {
      try {
        const mcpConfig = parseMCPServerConfig(serverName, serverConfig, priority)
        serverConfigs.push(mcpConfig)
        core.info(`✅ Loaded MCP server configuration: ${serverName}`)
        priority++
      } catch (error) {
        core.warning(`Failed to parse MCP server config for ${serverName}: ${error}`)
      }
    }

    core.info(`Loaded ${serverConfigs.length} MCP server configuration(s) from ${filePath}`)
    return serverConfigs
  } catch (error) {
    core.warning(`Failed to load MCP configuration from ${filePath}: ${error}`)
    return []
  }
}

/**
 * Parse a single MCP server configuration into MCPServerConfig format
 */
function parseMCPServerConfig(serverName: string, config: MCPConfigServer, priority: number): MCPServerConfig {
  // Determine server type based on configuration
  let serverType: 'http' | 'stdio'

  if (config.url) {
    serverType = 'http'
  } else if (config.command) {
    serverType = 'stdio'
  } else {
    throw new Error(`Server ${serverName} must have either 'url' (for HTTP) or 'command' (for stdio)`)
  }

  // Build the server configuration
  const serverConfig: MCPServerConfig = {
    id: serverName,
    name: serverName,
    type: serverType,
    priority,
  }

  // Add type-specific configuration
  if (serverType === 'http') {
    serverConfig.url = config.url
    serverConfig.headers = config.headers || {}
  } else if (serverType === 'stdio') {
    serverConfig.command = config.command
    serverConfig.args = config.args || []
    serverConfig.env = config.env || {}
  }

  return serverConfig
}

/**
 * Substitute environment variables in configuration values
 * Supports ${VAR_NAME} or $VAR_NAME syntax
 */
export function substituteEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g, (match, p1, p2) => {
    const varName = p1 || p2
    return process.env[varName] || match
  })
}

/**
 * Process configuration with environment variable substitution
 */
export function processConfigWithEnvVars(config: MCPConfigFile): MCPConfigFile {
  const processed: MCPConfigFile = {mcpServers: {}}

  for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
    const processedServer: MCPConfigServer = {}

    // Process command
    if (serverConfig.command) {
      processedServer.command = substituteEnvVars(serverConfig.command)
    }

    // Process args
    if (serverConfig.args) {
      processedServer.args = serverConfig.args.map(arg => substituteEnvVars(arg))
    }

    // Process env
    if (serverConfig.env) {
      processedServer.env = {}
      for (const [key, value] of Object.entries(serverConfig.env)) {
        processedServer.env[key] = substituteEnvVars(value)
      }
    }

    // Process url
    if (serverConfig.url) {
      processedServer.url = substituteEnvVars(serverConfig.url)
    }

    // Process headers
    if (serverConfig.headers) {
      processedServer.headers = {}
      for (const [key, value] of Object.entries(serverConfig.headers)) {
        processedServer.headers[key] = substituteEnvVars(value)
      }
    }

    processed.mcpServers[serverName] = processedServer
  }

  return processed
}
