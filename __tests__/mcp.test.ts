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
        const credentials = {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          tenantId: 'test-tenant-id',
        }
        const config = factory.createServerConfig(credentials)

        expect(config.id).toBe('azure')
        expect(config.name).toBe('Azure MCP')
        expect(config.type).toBe('stdio')
        expect(config.command).toBe('npx')
        expect(config.args).toEqual(['-y', '--no-update-notifier', '@azure/mcp@latest', 'server', 'start'])
        expect(config.env?.AZURE_CLIENT_ID).toBe('test-client-id')
        expect(config.env?.AZURE_CLIENT_SECRET).toBe('test-client-secret')
        expect(config.env?.AZURE_TENANT_ID).toBe('test-tenant-id')
        expect(config.priority).toBe(4)
      })

      it('validates credentials correctly', () => {
        const factory = new AzureMCPFactory()

        // Valid credentials
        expect(
          factory.isCredentialsValid({
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
            tenantId: 'test-tenant-id',
          }),
        ).toBe(true)

        // Invalid credentials - missing fields
        expect(factory.isCredentialsValid({})).toBe(false)
        expect(factory.isCredentialsValid({clientId: 'test-client-id'})).toBe(false)
        expect(
          factory.isCredentialsValid({
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
          }),
        ).toBe(false)
      })

      it('throws error for missing credentials', () => {
        const factory = new AzureMCPFactory()

        expect(() => factory.createServerConfig({})).toThrow('Azure MCP requires clientId, clientSecret, and tenantId')
        expect(() => factory.createServerConfig({clientId: 'test'})).toThrow(
          'Azure MCP requires clientId, clientSecret, and tenantId',
        )
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

        expect(configs).toHaveLength(3) // GitHub, Sentry, Datadog (Azure not provided)
        expect(configs[0].id).toBe('github')
        expect(configs[1].id).toBe('sentry')
        expect(configs[2].id).toBe('datadog')
      })

      it('creates all configs when all credentials provided', () => {
        const configs = createServerConfigs(
          'gh-token',
          'sentry-token',
          'dd-api',
          'dd-app',
          'azure-client-id',
          'azure-client-secret',
          'azure-tenant-id',
        )

        expect(configs).toHaveLength(4) // All servers: GitHub, Sentry, Datadog, Azure
        expect(configs[0].id).toBe('github')
        expect(configs[1].id).toBe('sentry')
        expect(configs[2].id).toBe('datadog')
        expect(configs[3].id).toBe('azure')
      })

      it('only creates configs for provided credentials', () => {
        const configs = createServerConfigs('gh-token')

        expect(configs).toHaveLength(1) // Only GitHub
        expect(configs[0].id).toBe('github')
      })

      it('includes Azure when only Azure credentials provided', () => {
        const configs = createServerConfigs(
          undefined,
          undefined,
          undefined,
          undefined,
          'azure-client-id',
          'azure-client-secret',
          'azure-tenant-id',
        )

        expect(configs).toHaveLength(1) // Only Azure
        expect(configs[0].id).toBe('azure')
      })
    })

    describe('createServerConfigsFromCredentials', () => {
      it('creates configs using credentials map', () => {
        const credentialsMap = new Map<string, Record<string, string>>([
          ['github', {token: 'gh-token'}],
          ['datadog', {apiKey: 'dd-api', appKey: 'dd-app'}],
        ])

        const configs = createServerConfigsFromCredentials(credentialsMap)

        // Only GitHub and Datadog (Azure now requires credentials)
        expect(configs).toHaveLength(2)
        expect(configs[0].id).toBe('github')
        expect(configs[1].id).toBe('datadog')
      })
    })

    describe('Enhanced MCPServerRegistry - Server Availability Tracking', () => {
      let registry: InstanceType<typeof MCPServerRegistry>

      beforeEach(() => {
        registry = new MCPServerRegistry()
        registry.register(new GitHubMCPFactory())
        registry.register(new SentryMCPFactory())
        registry.register(new DatadogMCPFactory())
        registry.register(new AzureMCPFactory())
      })

      describe('createConfigsWithAvailability', () => {
        it('reports all servers as available when all credentials are provided', () => {
          const credentialsMap = new Map<string, Record<string, string>>([
            ['github', {token: 'gh-token'}],
            ['sentry', {token: 'sentry-token'}],
            ['datadog', {apiKey: 'dd-api', appKey: 'dd-app'}],
            ['azure', {clientId: 'azure-client-id', clientSecret: 'azure-client-secret', tenantId: 'azure-tenant-id'}],
          ])

          const result = registry.createConfigsWithAvailability(credentialsMap)

          expect(result.available).toHaveLength(4)
          expect(result.unavailable).toHaveLength(0)
          expect(result.summary).toEqual({
            total: 4,
            available: 4,
            unavailable: 0,
          })

          // Verify all expected servers are available
          const availableIds = result.available.map(config => config.id)
          expect(availableIds).toContain('github')
          expect(availableIds).toContain('sentry')
          expect(availableIds).toContain('datadog')
          expect(availableIds).toContain('azure')

          // Verify priority sorting
          expect(result.available[0].id).toBe('github') // priority 1
          expect(result.available[1].id).toBe('sentry') // priority 2
          expect(result.available[2].id).toBe('datadog') // priority 3
          expect(result.available[3].id).toBe('azure') // priority 4
        })

        it('reports missing credentials correctly', () => {
          const credentialsMap = new Map<string, Record<string, string>>([
            ['github', {token: 'gh-token'}],
            // Missing sentry, datadog, and azure credentials
          ])

          const result = registry.createConfigsWithAvailability(credentialsMap)

          expect(result.available).toHaveLength(1)
          expect(result.unavailable).toHaveLength(3)
          expect(result.summary).toEqual({
            total: 4,
            available: 1,
            unavailable: 3,
          })

          // Check available servers
          const availableIds = result.available.map(config => config.id)
          expect(availableIds).toContain('github')

          // Check unavailable servers
          const unavailableServers = result.unavailable
          const sentryUnavailable = unavailableServers.find(s => s.serverId === 'sentry')
          const datadogUnavailable = unavailableServers.find(s => s.serverId === 'datadog')

          expect(sentryUnavailable).toBeDefined()
          expect(sentryUnavailable?.status).toBe('credentials-missing')
          expect(sentryUnavailable?.reason).toBe('No credentials provided for Sentry MCP')
          expect(sentryUnavailable?.lastChecked).toBeInstanceOf(Date)

          expect(datadogUnavailable).toBeDefined()
          expect(datadogUnavailable?.status).toBe('credentials-missing')
          expect(datadogUnavailable?.reason).toBe('No credentials provided for Datadog MCP')

          const azureUnavailable = unavailableServers.find(s => s.serverId === 'azure')
          expect(azureUnavailable).toBeDefined()
          expect(azureUnavailable?.status).toBe('credentials-missing')
          expect(azureUnavailable?.reason).toBe('No credentials provided for Azure MCP')
        })

        it('reports invalid credentials correctly', () => {
          const credentialsMap = new Map<string, Record<string, string>>([
            ['github', {token: 'gh-token'}],
            ['sentry', {}], // Invalid: missing token
            ['datadog', {apiKey: 'dd-api'}], // Invalid: missing appKey
            ['azure', {}], // Invalid: missing clientId, clientSecret, tenantId
          ])

          const result = registry.createConfigsWithAvailability(credentialsMap)

          expect(result.available).toHaveLength(1) // Only GitHub
          expect(result.unavailable).toHaveLength(3) // Sentry, Datadog, and Azure

          const sentryUnavailable = result.unavailable.find(s => s.serverId === 'sentry')
          const datadogUnavailable = result.unavailable.find(s => s.serverId === 'datadog')
          const azureUnavailable = result.unavailable.find(s => s.serverId === 'azure')

          expect(sentryUnavailable?.status).toBe('invalid-credentials')
          expect(sentryUnavailable?.reason).toBe('Invalid credentials for Sentry MCP')

          expect(datadogUnavailable?.status).toBe('invalid-credentials')
          expect(datadogUnavailable?.reason).toBe('Invalid credentials for Datadog MCP')

          expect(azureUnavailable?.status).toBe('invalid-credentials')
          expect(azureUnavailable?.reason).toBe('Invalid credentials for Azure MCP')
        })

        it('handles configuration creation failures gracefully', () => {
          // Create a mock factory that throws an error during config creation
          const mockFactory = {
            getId: () => 'failing-server',
            getName: () => 'Failing Server',
            isCredentialsValid: () => true,
            createServerConfig: () => {
              throw new Error('Configuration creation failed')
            },
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          registry.register(mockFactory as any)

          const credentialsMap = new Map<string, Record<string, string>>([
            ['github', {token: 'gh-token'}],
            ['failing-server', {some: 'credential'}],
          ])

          const result = registry.createConfigsWithAvailability(credentialsMap)

          expect(result.available).toHaveLength(1) // Only GitHub
          expect(result.unavailable).toHaveLength(4) // Sentry, Datadog, Azure, and failing-server

          const failingServer = result.unavailable.find(s => s.serverId === 'failing-server')
          expect(failingServer?.status).toBe('connection-failed')
          expect(failingServer?.reason).toBe('Failed to create config: Error: Configuration creation failed')
        })

        it('logs appropriate messages for server availability', () => {
          const credentialsMap = new Map<string, Record<string, string>>([['github', {token: 'gh-token'}]])

          registry.createConfigsWithAvailability(credentialsMap)

          // Verify success logs
          expect(core.info).toHaveBeenCalledWith('✅ GitHub MCP server available')

          // Verify summary log
          expect(core.info).toHaveBeenCalledWith(
            '📊 Server availability: 1/4 servers available. Unavailable: sentry, datadog, azure',
          )
        })

        it('logs when all servers are available', () => {
          const credentialsMap = new Map<string, Record<string, string>>([
            ['github', {token: 'gh-token'}],
            ['sentry', {token: 'sentry-token'}],
            ['datadog', {apiKey: 'dd-api', appKey: 'dd-app'}],
            ['azure', {clientId: 'azure-client-id', clientSecret: 'azure-client-secret', tenantId: 'azure-tenant-id'}],
          ])

          registry.createConfigsWithAvailability(credentialsMap)

          expect(core.info).toHaveBeenCalledWith('🎉 All 4 servers are available')
        })
      })

      describe('getRequiredCredentials', () => {
        it('discovers required credentials from factory validation errors', () => {
          const requirements = registry.getRequiredCredentials()

          // Should discover credential requirements by testing factories
          expect(requirements.has('github')).toBe(true)
          expect(requirements.get('github')).toEqual(['token'])

          expect(requirements.has('sentry')).toBe(true)
          expect(requirements.get('sentry')).toEqual(['token'])

          // Note: This is a heuristic-based approach, so results may vary
          // depending on the error message format from factories
        })

        it('handles factories that do not require credentials', () => {
          const requirements = registry.getRequiredCredentials()

          // All factories now require credentials
          // Azure now requires clientId, clientSecret, and tenantId
          expect(requirements.has('azure')).toBe(true)
          expect(requirements.get('azure')).toEqual(['clientId'])
        })
      })

      describe('hasMinimumServers', () => {
        it('returns true when sufficient servers are available', () => {
          const result = {
            available: [
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              {id: 'github'} as any,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              {id: 'azure'} as any,
            ],
            unavailable: [],
            summary: {total: 4, available: 2, unavailable: 2},
          }

          expect(registry.hasMinimumServers(result, 1)).toBe(true)
          expect(registry.hasMinimumServers(result, 2)).toBe(true)
          expect(registry.hasMinimumServers(result, 3)).toBe(false)
        })

        it('returns false when insufficient servers are available', () => {
          const result = {
            available: [],
            unavailable: [],
            summary: {total: 4, available: 0, unavailable: 4},
          }

          expect(registry.hasMinimumServers(result, 1)).toBe(false)
          expect(registry.hasMinimumServers(result, 0)).toBe(true) // 0 minimum is always satisfied
        })

        it('uses default minimum of 1 server when not specified', () => {
          const result = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            available: [{id: 'github'} as any],
            unavailable: [],
            summary: {total: 4, available: 1, unavailable: 3},
          }

          expect(registry.hasMinimumServers(result)).toBe(true)
        })
      })

      describe('backward compatibility with createConfigs', () => {
        it('maintains existing behavior while using enhanced method internally', () => {
          const credentialsMap = new Map<string, Record<string, string>>([['github', {token: 'gh-token'}]])

          const configs = registry.createConfigs(credentialsMap)

          // Should return only available configs (same as before)
          expect(configs).toHaveLength(1)
          expect(configs[0].id).toBe('github')

          // Should be sorted by priority
          expect(configs[0].priority).toBe(1)
        })
      })

      describe('real-world scenario: partial server availability', () => {
        it('gracefully handles scenario with only GitHub credentials', () => {
          // Simulate your actual use case: only GitHub token available
          const credentialsMap = new Map<string, Record<string, string>>([
            ['github', {token: 'actual-github-token'}],
            // No Datadog credentials yet
            // No Sentry credentials yet
            // No Azure credentials yet
          ])

          const result = registry.createConfigsWithAvailability(credentialsMap)

          // Should have only GitHub available
          expect(result.available).toHaveLength(1)
          expect(result.unavailable).toHaveLength(3)

          // Should report missing credentials clearly
          const unavailableIds = result.unavailable.map(s => s.serverId)
          expect(unavailableIds).toContain('sentry')
          expect(unavailableIds).toContain('datadog')
          expect(unavailableIds).toContain('azure')

          // Should still have sufficient servers for basic operation
          expect(registry.hasMinimumServers(result, 1)).toBe(true)

          // Should proceed with inference using available servers
          const availableIds = result.available.map(c => c.id)
          expect(availableIds).toContain('github')

          // Log should indicate partial availability
          expect(core.info).toHaveBeenCalledWith(
            '📊 Server availability: 1/4 servers available. Unavailable: sentry, datadog, azure',
          )
        })
      })
    })
  })
})
