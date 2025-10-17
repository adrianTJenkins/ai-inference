import * as core from '@actions/core'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export interface ToolResult {
  tool_call_id: string
  role: 'tool'
  name: string
  content: string
}

export interface MCPTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

export interface ToolCall {
  id: string
  type: string
  function: {
    name: string
    arguments: string
  }
}

interface MultiServerTool extends MCPTool {
  serverId: string
  serverName: string
}

export interface MCPServerConfig {
  id: string
  name: string
  type: 'http' | 'stdio'

  url?: string
  headers?: Record<string, string>

  command?: string
  args?: string[]
  env?: Record<string, string>

  readonly?: boolean
  priority?: number
}

export interface MCPServerClient {
  config: MCPServerConfig
  client: Client
  tools: Array<MCPTool>
  connected: boolean
}

export interface MultiMCPManager {
  servers: Map<string, MCPServerClient>
  toolRegistry: Map<string, MCPServerClient>

  connectToServers(configs: MCPServerConfig[]): Promise<void>
  executeToolCall(toolCall: ToolCall): Promise<ToolResult>
  getAllTools(): Array<MultiServerTool>
}

/**
 * Connect to the GitHub MCP server and retrieve available tools
 */
export async function connectToGitHubMCP(token: string): Promise<MCPServerClient | null> {
  const githubMcpUrl = 'https://api.githubcopilot.com/mcp/'

  core.info('Connecting to GitHub MCP server...')

  const config: MCPServerConfig = {
    id: 'github',
    name: 'GitHub MCP',
    type: 'http',
    url: githubMcpUrl,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-MCP-Readonly': 'true',
    },
    readonly: true,
    priority: 1,
  }

  const transport = new StreamableHTTPClientTransport(new URL(githubMcpUrl), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-MCP-Readonly': 'true',
      },
    },
  })

  const client = new Client({
    name: 'ai-inference-action',
    version: '1.0.0',
    transport,
  })

  try {
    await client.connect(transport)
  } catch (mcpError) {
    core.warning(`Failed to connect to GitHub MCP server: ${mcpError}`)
    return null
  }

  core.info('Successfully connected to GitHub MCP server')

  const toolsResponse = await client.listTools()
  core.info(`Retrieved ${toolsResponse.tools?.length || 0} tools from GitHub MCP server`)

  // Map GitHub MCP tools → Azure AI Inference tool definitions
  const tools = (toolsResponse.tools || []).map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }))

  core.info(`Mapped ${tools.length} GitHub MCP tools for Azure AI Inference`)

  return {
    config,
    client,
    tools,
    connected: true,
  }
}

/**
 * Execute a single tool call via GitHub MCP
 */
export async function executeToolCall(githubMcpClient: Client, toolCall: ToolCall): Promise<ToolResult> {
  core.info(`Executing GitHub MCP tool: ${toolCall.function.name} with args: ${toolCall.function.arguments}`)

  try {
    const args = JSON.parse(toolCall.function.arguments)

    const result = await githubMcpClient.callTool({
      name: toolCall.function.name,
      arguments: args,
    })

    core.info(`GitHub MCP tool ${toolCall.function.name} executed successfully`)

    return {
      tool_call_id: toolCall.id,
      role: 'tool',
      name: toolCall.function.name,
      content: JSON.stringify(result.content),
    }
  } catch (toolError) {
    core.warning(`Failed to execute GitHub MCP tool ${toolCall.function.name}: ${toolError}`)

    return {
      tool_call_id: toolCall.id,
      role: 'tool',
      name: toolCall.function.name,
      content: `Error: ${toolError}`,
    }
  }
}

/**
 * Execute all tool calls from a response via GitHub MCP
 */
export async function executeToolCalls(githubMcpClient: Client, toolCalls: ToolCall[]): Promise<ToolResult[]> {
  const toolResults: ToolResult[] = []

  for (const toolCall of toolCalls) {
    const result = await executeToolCall(githubMcpClient, toolCall)
    toolResults.push(result)
  }

  return toolResults
}
