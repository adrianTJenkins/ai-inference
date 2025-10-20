import {vi, type MockedFunction, describe, it, expect, beforeEach} from 'vitest'
import * as core from '../__fixtures__/core.js'

// Mock MCP SDK
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockConnect = vi.fn() as MockedFunction<any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockListTools = vi.fn() as MockedFunction<any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCallTool = vi.fn() as MockedFunction<any>

const mockClient = {
  connect: mockConnect,
  listTools: mockListTools,
  callTool: mockCallTool,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn(() => mockClient),
}))

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn(),
}))

vi.mock('@actions/core', () => core)

// Import the module being tested
const {
  connectToGitHubMCP,
  executeToolCall,
  executeToolCalls,
  createServerConfigs,
  createServerConfigsFromCredentials,
  GitHubMCPFactory,
  SentryMCPFactory,
  DatadogMCPFactory,
  AzureMCPFactory,
  MCPServerRegistry,
} = await import('../src/mcp.js')

describe('mcp.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('connectToGitHubMCP', () => {
    it('successfully connects to MCP server and retrieves tools', async () => {
      const token = 'test-token'
      const mockTools = [
        {
          name: 'test-tool-1',
          description: 'Test tool 1',
          inputSchema: {type: 'object', properties: {}},
        },
        {
          name: 'test-tool-2',
          description: 'Test tool 2',
          inputSchema: {
            type: 'object',
            properties: {param: {type: 'string'}},
          },
        },
      ]

      mockConnect.mockResolvedValue(undefined)
      mockListTools.mockResolvedValue({tools: mockTools})

      const result = await connectToGitHubMCP(token)

      expect(result).not.toBeNull()
      expect(result?.config).toEqual({
        id: 'github',
        name: 'GitHub MCP',
        type: 'http',
        url: 'https://api.githubcopilot.com/mcp/',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-MCP-Readonly': 'true',
        },
        readonly: true,
        priority: 1,
      })
      expect(result?.client).toBe(mockClient)
      expect(result?.connected).toBe(true)
      expect(result?.tools).toHaveLength(2)
      expect(result?.tools[0]).toEqual({
        type: 'function',
        function: {
          name: 'test-tool-1',
          description: 'Test tool 1',
          parameters: {type: 'object', properties: {}},
        },
      })
      expect(core.info).toHaveBeenCalledWith('Connecting to GitHub MCP server...')
      expect(core.info).toHaveBeenCalledWith('Successfully connected to GitHub MCP server')
      expect(core.info).toHaveBeenCalledWith('Retrieved 2 tools from GitHub MCP server')
      expect(core.info).toHaveBeenCalledWith('Mapped 2 tools from GitHub MCP for Azure AI Inference')
    })

    it('returns null when connection fails', async () => {
      const token = 'test-token'
      const connectionError = new Error('Connection failed')

      mockConnect.mockRejectedValue(connectionError)

      const result = await connectToGitHubMCP(token)

      expect(result).toBeNull()
      expect(core.warning).toHaveBeenCalledWith('Failed to connect to GitHub MCP server: Error: Connection failed')
    })

    it('handles empty tools list', async () => {
      const token = 'test-token'

      mockConnect.mockResolvedValue(undefined)
      mockListTools.mockResolvedValue({tools: []})

      const result = await connectToGitHubMCP(token)

      expect(result).not.toBeNull()
      expect(result?.config).toEqual({
        id: 'github',
        name: 'GitHub MCP',
        type: 'http',
        url: 'https://api.githubcopilot.com/mcp/',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-MCP-Readonly': 'true',
        },
        readonly: true,
        priority: 1,
      })
      expect(result?.client).toBe(mockClient)
      expect(result?.connected).toBe(true)
      expect(result?.tools).toHaveLength(0)
      expect(core.info).toHaveBeenCalledWith('Retrieved 0 tools from GitHub MCP server')
      expect(core.info).toHaveBeenCalledWith('Mapped 0 tools from GitHub MCP for Azure AI Inference')
    })

    it('handles undefined tools list', async () => {
      const token = 'test-token'

      mockConnect.mockResolvedValue(undefined)
      mockListTools.mockResolvedValue({})

      const result = await connectToGitHubMCP(token)

      expect(result).not.toBeNull()
      expect(result?.config).toEqual({
        id: 'github',
        name: 'GitHub MCP',
        type: 'http',
        url: 'https://api.githubcopilot.com/mcp/',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-MCP-Readonly': 'true',
        },
        readonly: true,
        priority: 1,
      })
      expect(result?.client).toBe(mockClient)
      expect(result?.connected).toBe(true)
      expect(result?.tools).toHaveLength(0)
      expect(core.info).toHaveBeenCalledWith('Retrieved 0 tools from GitHub MCP server')
    })
  })

  describe('executeToolCall', () => {
    it('successfully executes a tool call', async () => {
      const toolCall = {
        id: 'call-123',
        type: 'function',
        function: {
          name: 'test-tool',
          arguments: '{"param": "value"}',
        },
      }
      const toolResult = {
        content: [{type: 'text', text: 'Tool execution result'}],
      }

      mockCallTool.mockResolvedValue(toolResult)

      const result = await executeToolCall(mockClient, toolCall)

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'test-tool',
        arguments: {param: 'value'},
      })
      expect(result).toEqual({
        tool_call_id: 'call-123',
        role: 'tool',
        name: 'test-tool',
        content: JSON.stringify(toolResult.content),
      })
      expect(core.info).toHaveBeenCalledWith('Executing GitHub MCP tool: test-tool with args: {"param": "value"}')
      expect(core.info).toHaveBeenCalledWith('GitHub MCP tool test-tool executed successfully')
    })

    it('handles tool execution errors gracefully', async () => {
      const toolCall = {
        id: 'call-456',
        type: 'function',
        function: {
          name: 'failing-tool',
          arguments: '{"param": "value"}',
        },
      }
      const toolError = new Error('Tool execution failed')

      mockCallTool.mockRejectedValue(toolError)

      const result = await executeToolCall(mockClient, toolCall)

      expect(result).toEqual({
        tool_call_id: 'call-456',
        role: 'tool',
        name: 'failing-tool',
        content: 'Error: Error: Tool execution failed',
      })
      expect(core.warning).toHaveBeenCalledWith(
        'Failed to execute GitHub MCP tool failing-tool: Error: Tool execution failed',
      )
    })

    it('handles invalid JSON arguments', async () => {
      const toolCall = {
        id: 'call-789',
        type: 'function',
        function: {
          name: 'test-tool',
          arguments: 'invalid-json',
        },
      }

      const result = await executeToolCall(mockClient, toolCall)

      expect(result.tool_call_id).toBe('call-789')
      expect(result.role).toBe('tool')
      expect(result.name).toBe('test-tool')
      expect(result.content).toContain('Error:')
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to execute GitHub MCP tool test-tool:'))
    })
  })

  describe('executeToolCalls', () => {
    it('executes multiple tool calls successfully', async () => {
      const toolCalls = [
        {
          id: 'call-1',
          type: 'function',
          function: {name: 'tool-1', arguments: '{}'},
        },
        {
          id: 'call-2',
          type: 'function',
          function: {name: 'tool-2', arguments: '{"param": "value"}'},
        },
      ]

      mockCallTool
        .mockResolvedValueOnce({
          content: [{type: 'text', text: 'Result 1'}],
        })
        .mockResolvedValueOnce({
          content: [{type: 'text', text: 'Result 2'}],
        })

      const results = await executeToolCalls(mockClient, toolCalls)

      expect(results).toHaveLength(2)
      expect(results[0].tool_call_id).toBe('call-1')
      expect(results[1].tool_call_id).toBe('call-2')
      expect(mockCallTool).toHaveBeenCalledTimes(2)
    })

    it('handles empty tool calls array', async () => {
      const results = await executeToolCalls(mockClient, [])

      expect(results).toHaveLength(0)
      expect(mockCallTool).not.toHaveBeenCalled()
    })

    it('continues execution even if some tools fail', async () => {
      const toolCalls = [
        {
          id: 'call-1',
          type: 'function',
          function: {name: 'tool-1', arguments: '{}'},
        },
        {
          id: 'call-2',
          type: 'function',
          function: {name: 'tool-2', arguments: '{}'},
        },
      ]

      mockCallTool
        .mockResolvedValueOnce({
          content: [{type: 'text', text: 'Result 1'}],
        })
        .mockRejectedValueOnce(new Error('Tool 2 failed'))

      const results = await executeToolCalls(mockClient, toolCalls)

      expect(results).toHaveLength(2)
      expect(results[0].content).toContain('Result 1')
      expect(results[1].content).toContain('Error:')
    })
  })

  describe('Factory Pattern', () => {
    describe('GitHubMCPFactory', () => {
      it('creates correct configuration', () => {
        const factory = new GitHubMCPFactory()
        const credentials = {token: 'test-token'}

        const config = factory.createServerConfig(credentials)

        expect(config.id).toBe('github')
        expect(config.name).toBe('GitHub MCP')
        expect(config.type).toBe('http')
        expect(config.url).toBe('https://api.githubcopilot.com/mcp/')
        expect(config.headers?.Authorization).toBe('Bearer test-token')
        expect(config.readonly).toBe(true)
        expect(config.priority).toBe(1)
      })

      it('validates credentials correctly', () => {
        const factory = new GitHubMCPFactory()

        expect(factory.isCredentialsValid({token: 'test-token'})).toBe(true)
        expect(factory.isCredentialsValid({})).toBe(false)
        expect(factory.isCredentialsValid({token: ''})).toBe(false)
      })

      it('throws error for missing credentials', () => {
        const factory = new GitHubMCPFactory()

        expect(() => factory.createServerConfig({})).toThrow('GitHub MCP requires token')
      })
    })

    describe('SentryMCPFactory', () => {
      it('creates correct configuration', () => {
        const factory = new SentryMCPFactory()
        const credentials = {token: 'sentry-token'}

        const config = factory.createServerConfig(credentials)

        expect(config.id).toBe('sentry')
        expect(config.name).toBe('Sentry MCP')
        expect(config.type).toBe('stdio')
        expect(config.command).toBe('npx')
        expect(config.args).toEqual([
          '-y',
          '--no-update-notifier',
          '@sentry/mcp-server@latest',
          '--host=github.sentry.io',
        ])
        expect(config.env?.SENTRY_ACCESS_TOKEN).toBe('sentry-token')
        expect(config.priority).toBe(2)
      })
    })

    describe('DatadogMCPFactory', () => {
      it('creates correct configuration', () => {
        const factory = new DatadogMCPFactory()
        const credentials = {apiKey: 'dd-api-key', appKey: 'dd-app-key'}

        const config = factory.createServerConfig(credentials)

        expect(config.id).toBe('datadog')
        expect(config.name).toBe('Datadog MCP')
        expect(config.type).toBe('http')
        expect(config.url).toBe('https://mcp.datadoghq.com/api/unstable/mcp-server/mcp')
        expect(config.headers?.DD_API_KEY).toBe('dd-api-key')
        expect(config.headers?.DD_APPLICATION_KEY).toBe('dd-app-key')
        expect(config.priority).toBe(3)
      })

      it('validates both API key and app key', () => {
        const factory = new DatadogMCPFactory()

        expect(factory.isCredentialsValid({apiKey: 'key', appKey: 'app'})).toBe(true)
        expect(factory.isCredentialsValid({apiKey: 'key'})).toBe(false)
        expect(factory.isCredentialsValid({appKey: 'app'})).toBe(false)
        expect(factory.isCredentialsValid({})).toBe(false)
      })
    })

    describe('AzureMCPFactory', () => {
      it('creates correct configuration', () => {
        const factory = new AzureMCPFactory()
        const config = factory.createServerConfig({})

        expect(config.id).toBe('azure')
        expect(config.name).toBe('Azure MCP')
        expect(config.type).toBe('stdio')
        expect(config.command).toBe('npx')
        expect(config.args).toEqual(['-y', '--no-update-notifier', '@azure/mcp@latest', 'server', 'start'])
        expect(config.priority).toBe(4)
      })

      it('always considers credentials valid', () => {
        const factory = new AzureMCPFactory()

        expect(factory.isCredentialsValid({})).toBe(true)
        expect(factory.isCredentialsValid({anyKey: 'anyValue'})).toBe(true)
      })
    })

    describe('MCPServerRegistry', () => {
      it('registers and retrieves factories', () => {
        const registry = new MCPServerRegistry()
        const githubFactory = new GitHubMCPFactory()

        registry.register(githubFactory)

        expect(registry.getFactory('github')).toBe(githubFactory)
        expect(registry.getFactory('nonexistent')).toBeUndefined()
        expect(registry.getAllFactories()).toHaveLength(1)
      })

      it('creates configs from credentials map', () => {
        const registry = new MCPServerRegistry()
        registry.register(new GitHubMCPFactory())
        registry.register(new SentryMCPFactory())

        const credentialsMap = new Map<string, Record<string, string>>([
          ['github', {token: 'gh-token'}],
          ['sentry', {token: 'sentry-token'}],
          ['nonexistent', {token: 'invalid'}],
        ])

        const configs = registry.createConfigs(credentialsMap)

        expect(configs).toHaveLength(2)
        expect(configs[0].id).toBe('github')
        expect(configs[1].id).toBe('sentry')
      })

      it('sorts configs by priority', () => {
        const registry = new MCPServerRegistry()
        registry.register(new DatadogMCPFactory()) // priority 3
        registry.register(new GitHubMCPFactory()) // priority 1

        const credentialsMap = new Map<string, Record<string, string>>([
          ['github', {token: 'gh-token'}],
          ['datadog', {apiKey: 'dd-api', appKey: 'dd-app'}],
        ])

        const configs = registry.createConfigs(credentialsMap)

        expect(configs).toHaveLength(2)
        expect(configs[0].id).toBe('github') // priority 1 comes first
        expect(configs[1].id).toBe('datadog') // priority 3 comes second
      })
    })

    describe('createServerConfigs (backward compatibility)', () => {
      it('creates configs using factory pattern', () => {
        const configs = createServerConfigs('gh-token', 'sentry-token', 'dd-api', 'dd-app')

        expect(configs).toHaveLength(4) // GitHub, Sentry, Datadog, Azure
        expect(configs[0].id).toBe('github')
        expect(configs[1].id).toBe('sentry')
        expect(configs[2].id).toBe('datadog')
        expect(configs[3].id).toBe('azure')
      })

      it('only creates configs for provided credentials', () => {
        const configs = createServerConfigs('gh-token')

        expect(configs).toHaveLength(2) // GitHub and Azure (Azure doesn't require credentials)
        expect(configs[0].id).toBe('github')
        expect(configs[1].id).toBe('azure')
      })
    })

    describe('createServerConfigsFromCredentials', () => {
      it('creates configs using credentials map', () => {
        const credentialsMap = new Map<string, Record<string, string>>([
          ['github', {token: 'gh-token'}],
          ['datadog', {apiKey: 'dd-api', appKey: 'dd-app'}],
        ])

        const configs = createServerConfigsFromCredentials(credentialsMap)

        expect(configs).toHaveLength(2)
        expect(configs[0].id).toBe('github')
        expect(configs[1].id).toBe('datadog')
      })
    })
  })
})
