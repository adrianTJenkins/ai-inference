import {vi, describe, expect, it, beforeEach, type MockedFunction} from 'vitest'
import * as core from '../__fixtures__/core.js'

// Default to throwing errors to catch unexpected calls
const mockExistsSync = vi.fn().mockImplementation(() => {
  throw new Error('Unexpected call to existsSync - test should override this implementation')
})
const mockReadFileSync = vi.fn().mockImplementation(() => {
  throw new Error('Unexpected call to readFileSync - test should override this implementation')
})
const mockWriteFileSync = vi.fn()

/**
 * Helper function to mock file system operations for one or more files
 * @param fileContents - Object mapping file paths to their contents
 * @param nonExistentFiles - Array of file paths that should be treated as non-existent
 */
function mockFileContent(fileContents: Record<string, string> = {}, nonExistentFiles: string[] = []): void {
  // Mock existsSync to return true for files that exist, false for those that don't
  mockExistsSync.mockImplementation((...args: unknown[]): boolean => {
    const [path] = args as [string]
    if (nonExistentFiles.includes(path)) {
      return false
    }
    return path in fileContents || true
  })

  // Mock readFileSync to return the content for known files
  mockReadFileSync.mockImplementation((...args: unknown[]): string => {
    const [path, options] = args as [string, BufferEncoding]
    if (options === 'utf-8' && path in fileContents) {
      return fileContents[path]
    }
    throw new Error(`Unexpected file read: ${path}`)
  })
}

/**
 * Helper function to mock action inputs
 * @param inputs - Object mapping input names to their values
 */
function mockInputs(inputs: Record<string, string> = {}): void {
  // Default values that are applied unless overridden
  const defaultInputs: Record<string, string> = {
    token: 'fake-token',
    model: 'gpt-4',
    'max-tokens': '100',
    endpoint: 'https://api.test.com',
  }

  // Combine defaults with user-provided inputs
  const allInputs: Record<string, string> = {...defaultInputs, ...inputs}

  core.getInput.mockImplementation((name: string) => {
    return allInputs[name] || ''
  })

  core.getBooleanInput.mockImplementation((name: string) => {
    const value = allInputs[name]
    return value === 'true'
  })
}

/**
 * Helper function to verify common response assertions
 */
function verifyStandardResponse(): void {
  expect(core.setOutput).toHaveBeenNthCalledWith(1, 'response', 'Hello, user!')
  expect(core.setOutput).toHaveBeenNthCalledWith(2, 'response-file', expect.stringContaining('modelResponse-'))
}

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}))

// Mocks for tmp module to control temporary file creation and cleanup
const mockRemoveCallback = vi.fn()
const mockFileSync = vi.fn().mockReturnValue({
  name: '/secure/temp/dir/modelResponse-abc123.txt',
  removeCallback: mockRemoveCallback,
})
const mockSetGracefulCleanup = vi.fn()

vi.mock('tmp', () => ({
  fileSync: mockFileSync,
  setGracefulCleanup: mockSetGracefulCleanup,
}))

// Mock MCP and inference modules
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSimpleInference = vi.fn() as MockedFunction<any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockMultiMcpInference = vi.fn() as MockedFunction<any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCreateConfigsWithAvailability = vi.fn() as MockedFunction<any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockConnect = vi.fn() as MockedFunction<any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockConnectWithFiltering = vi.fn() as MockedFunction<any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRegister = vi.fn() as MockedFunction<any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockLoadMCPConfig = vi.fn() as MockedFunction<any>

// Mock the registry class with all needed methods
class MockMCPServerRegistry {
  register = mockRegister
  createConfigsWithAvailability = mockCreateConfigsWithAvailability
  hasMinimumServers = vi.fn().mockReturnValue(true)
  getFactory = vi.fn().mockImplementation((serverId: string) => {
    const toolMap = {
      github: [
        'search_issues',
        'issue_read',
        'search_code',
        'search_pull_requests',
        'pull_request_read',
        'assign_copilot_to_issue',
      ],
      datadog: ['get_datadog_metric', 'search_datadog_monitors'],
      azure: ['kusto'],
      sentry: ['search_events', 'get_trace_details'],
    }
    return {
      getAllowedTools: () => toolMap[serverId as keyof typeof toolMap] || ['search_issues', 'get_issue', 'search_code'],
    }
  })
}

vi.mock('../src/mcp.js', () => ({
  MCPServerRegistry: MockMCPServerRegistry,
  GitHubMCPFactory: vi.fn(),
  SentryMCPFactory: vi.fn(),
  DatadogMCPFactory: vi.fn(),
  AzureMCPFactory: vi.fn(),
  connectToMCPServer: mockConnect,
  connectToMCPServerWithFiltering: mockConnectWithFiltering,
}))

vi.mock('../src/mcp-config.js', () => ({
  loadMCPConfig: mockLoadMCPConfig,
}))

vi.mock('../src/inference.js', () => ({
  simpleInference: mockSimpleInference,
  multiMcpInference: mockMultiMcpInference,
}))

vi.mock('@actions/core', () => core)

// Mock process.exit to prevent it from actually exiting during tests
const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation(() => {
  // Prevent actual exit, but don't throw - just return
  return undefined as never
})

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const {run} = await import('../src/main.js')

describe('main.ts', () => {
  // Reset all mocks before each test
  beforeEach(() => {
    vi.clearAllMocks()
    mockProcessExit.mockClear()

    // Remove any existing GITHUB_TOKEN
    delete process.env.GITHUB_TOKEN

    // Set up default mock responses
    mockSimpleInference.mockResolvedValue('Hello, user!')
    mockMultiMcpInference.mockResolvedValue('Hello, user!')

    // By default, return empty config (no MCP servers configured)
    mockLoadMCPConfig.mockReturnValue([])
  })

  it('Sets the response output', async () => {
    mockInputs({
      prompt: 'Hello, AI!',
      'system-prompt': 'You are a test assistant.',
    })

    await run()

    expect(core.setOutput).toHaveBeenCalled()
    verifyStandardResponse()
    expect(mockProcessExit).toHaveBeenCalledWith(0)
  })

  it('Sets a failed status when no prompt is set', async () => {
    mockInputs({
      prompt: '',
      'prompt-file': '',
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith('Neither prompt-file nor prompt was set')
    expect(mockProcessExit).toHaveBeenCalledWith(1)
  })

  it('uses simple inference when MCP is disabled', async () => {
    mockInputs({
      prompt: 'Hello, AI!',
      'system-prompt': 'You are a test assistant.',
      'enable-github-mcp': 'false',
    })

    await run()

    expect(mockSimpleInference).toHaveBeenCalledWith({
      messages: [
        {role: 'system', content: 'You are a test assistant.'},
        {role: 'user', content: 'Hello, AI!'},
      ],
      modelName: 'gpt-4',
      maxTokens: 100,
      endpoint: 'https://api.test.com',
      token: 'fake-token',
      responseFormat: undefined,
    })
    expect(mockMultiMcpInference).not.toHaveBeenCalled()
    verifyStandardResponse()
    expect(mockProcessExit).toHaveBeenCalledWith(0)
  })

  it('uses MCP inference when enabled and connection succeeds', async () => {
    const mockMcpClient = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: {} as any,
      tools: [{type: 'function', function: {name: 'test-tool'}}],
      config: {id: 'github', name: 'GitHub', type: 'http', url: 'test'},
      connected: true,
    }

    mockInputs({
      prompt: 'Hello, AI!',
      'system-prompt': 'You are a test assistant.',
      'enable-github-mcp': 'true',
    })

    // Mock loadMCPConfig to return a server configuration
    mockLoadMCPConfig.mockReturnValue([{id: 'github', name: 'GitHub', type: 'http', url: 'test'}])

    // Mock the connection to return the client
    mockConnect.mockResolvedValue(mockMcpClient)

    await run()

    expect(mockLoadMCPConfig).toHaveBeenCalled()
    expect(mockMultiMcpInference).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {role: 'system', content: 'You are a test assistant.'},
          {role: 'user', content: 'Hello, AI!'},
        ],
        token: 'fake-token',
      }),
      [mockMcpClient],
    )
    expect(mockSimpleInference).not.toHaveBeenCalled()
    verifyStandardResponse()
    expect(mockProcessExit).toHaveBeenCalledWith(0)
  })

  it('falls back to simple inference when MCP connection fails', async () => {
    mockInputs({
      prompt: 'Hello, AI!',
      'system-prompt': 'You are a test assistant.',
      'enable-github-mcp': 'true',
    })

    // Mock loadMCPConfig to return a server configuration
    mockLoadMCPConfig.mockReturnValue([{id: 'github', name: 'GitHub', type: 'http', url: 'test'}])

    // Mock the connection to fail
    mockConnect.mockResolvedValue(null)

    await run()

    expect(mockLoadMCPConfig).toHaveBeenCalled()
    expect(mockSimpleInference).toHaveBeenCalled()
    expect(mockMultiMcpInference).not.toHaveBeenCalled()
    expect(core.warning).toHaveBeenCalledWith(
      '⚠️ No MCP servers connected successfully, falling back to simple inference',
    )
    verifyStandardResponse()
    expect(mockProcessExit).toHaveBeenCalledWith(0)
  })

  it('properly integrates with loadContentFromFileOrInput', async () => {
    const promptFile = 'prompt.txt'
    const systemPromptFile = 'system-prompt.txt'
    const promptContent = 'File-based prompt'
    const systemPromptContent = 'File-based system prompt'

    mockFileContent({
      [promptFile]: promptContent,
      [systemPromptFile]: systemPromptContent,
    })

    mockInputs({
      'prompt-file': promptFile,
      'system-prompt-file': systemPromptFile,
      'enable-github-mcp': 'false',
    })

    await run()

    expect(mockSimpleInference).toHaveBeenCalledWith({
      messages: [
        {role: 'system', content: systemPromptContent},
        {role: 'user', content: promptContent},
      ],
      modelName: 'gpt-4',
      maxTokens: 100,
      endpoint: 'https://api.test.com',
      token: 'fake-token',
      responseFormat: undefined,
    })
    verifyStandardResponse()
    expect(mockProcessExit).toHaveBeenCalledWith(0)
  })

  it('handles non-existent prompt-file with an error', async () => {
    const promptFile = 'non-existent-prompt.txt'

    mockFileContent({}, [promptFile])

    mockInputs({
      'prompt-file': promptFile,
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(`File for prompt-file was not found: ${promptFile}`)
    expect(mockProcessExit).toHaveBeenCalledWith(1)
  })

  it('creates secure temporary files with proper cleanup', async () => {
    mockInputs({
      prompt: 'Test prompt',
      'system-prompt': 'You are a test assistant.',
    })

    await run()

    expect(mockSetGracefulCleanup).toHaveBeenCalledOnce()

    expect(mockFileSync).toHaveBeenCalledWith({
      prefix: 'modelResponse-',
      postfix: '.txt',
    })

    expect(core.setOutput).toHaveBeenNthCalledWith(2, 'response-file', '/secure/temp/dir/modelResponse-abc123.txt')
    expect(mockWriteFileSync).toHaveBeenCalledWith('/secure/temp/dir/modelResponse-abc123.txt', 'Hello, user!', 'utf-8')
    expect(mockRemoveCallback).toHaveBeenCalledOnce()

    expect(mockProcessExit).toHaveBeenCalledWith(0)
  })

  it('handles cleanup errors gracefully', async () => {
    mockRemoveCallback.mockImplementationOnce(() => {
      throw new Error('Cleanup failed')
    })

    mockInputs({
      prompt: 'Test prompt',
      'system-prompt': 'You are a test assistant.',
    })

    await run()

    expect(mockRemoveCallback).toHaveBeenCalledOnce()
    expect(core.warning).toHaveBeenCalledWith('Failed to cleanup temporary file: Error: Cleanup failed')
    expect(mockProcessExit).toHaveBeenCalledWith(0)
  })

  describe('Multi-server scenarios', () => {
    it('uses multi-server inference with multiple connected servers', async () => {
      const mockGitHubClient = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: {} as any,
        tools: [{type: 'function', function: {name: 'github-search'}}],
        config: {id: 'github', name: 'GitHub', type: 'http', url: 'github-test'},
        connected: true,
      }

      const mockSentryClient = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: {} as any,
        tools: [{type: 'function', function: {name: 'sentry-issues'}}],
        config: {id: 'sentry', name: 'Sentry', type: 'http', url: 'sentry-test'},
        connected: true,
      }

      mockInputs({
        prompt: 'Hello, AI!',
        'system-prompt': 'You are a test assistant.',
        'enable-mcp': 'true',
      })

      mockLoadMCPConfig.mockReturnValue([
        {id: 'github', name: 'GitHub', type: 'http', url: 'github-test'},
        {id: 'sentry', name: 'Sentry', type: 'http', url: 'sentry-test'},
      ])

      mockConnect.mockResolvedValueOnce(mockGitHubClient).mockResolvedValueOnce(mockSentryClient)

      await run()

      expect(mockLoadMCPConfig).toHaveBeenCalled()
      expect(mockConnect).toHaveBeenCalledTimes(2)
      expect(mockMultiMcpInference).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {role: 'system', content: 'You are a test assistant.'},
            {role: 'user', content: 'Hello, AI!'},
          ],
        }),
        [mockGitHubClient, mockSentryClient],
      )
      expect(mockSimpleInference).not.toHaveBeenCalled()
      verifyStandardResponse()
    })

    it('handles mixed availability with some servers connected and others unavailable', async () => {
      const mockDatadogClient = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: {} as any,
        tools: [{type: 'function', function: {name: 'datadog-metrics'}}],
        config: {id: 'datadog', name: 'Datadog', type: 'http', url: 'datadog-test'},
        connected: true,
      }

      mockInputs({
        prompt: 'Monitor the system',
        'system-prompt': 'You are a monitoring assistant.',
        'enable-mcp': 'true',
      })

      mockLoadMCPConfig.mockReturnValue([
        {id: 'datadog', name: 'Datadog', type: 'http', url: 'datadog-test'},
        {id: 'azure', name: 'Azure', type: 'stdio', command: 'azure-mcp'},
      ])

      // Datadog succeeds, Azure fails
      mockConnect.mockResolvedValueOnce(mockDatadogClient).mockResolvedValueOnce(null)

      await run()

      expect(mockLoadMCPConfig).toHaveBeenCalled()
      expect(mockConnect).toHaveBeenCalledTimes(2)
      expect(mockMultiMcpInference).toHaveBeenCalledWith(expect.any(Object), [mockDatadogClient])
      expect(mockSimpleInference).not.toHaveBeenCalled()
      verifyStandardResponse()
    })

    it('validates Azure server with complete SPN credentials', async () => {
      const mockAzureClient = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: {} as any,
        tools: [{type: 'function', function: {name: 'azure-resources'}}],
        config: {id: 'azure', name: 'Azure', type: 'stdio', command: 'azure-mcp'},
        connected: true,
      }

      mockInputs({
        prompt: 'List Azure resources',
        'system-prompt': 'You are an Azure assistant.',
        'enable-mcp': 'true',
      })

      mockLoadMCPConfig.mockReturnValue([{id: 'azure', name: 'Azure', type: 'stdio', command: 'azure-mcp'}])

      mockConnect.mockResolvedValueOnce(mockAzureClient)

      await run()

      expect(mockLoadMCPConfig).toHaveBeenCalled()
      expect(mockConnect).toHaveBeenCalledWith({
        id: 'azure',
        name: 'Azure',
        type: 'stdio',
        command: 'azure-mcp',
      })
      expect(mockMultiMcpInference).toHaveBeenCalledWith(expect.any(Object), [mockAzureClient])
      expect(mockSimpleInference).not.toHaveBeenCalled()
      verifyStandardResponse()
    })

    it('falls back when all servers are unavailable due to missing credentials', async () => {
      mockInputs({
        prompt: 'Help me debug',
        'system-prompt': 'You are a debugging assistant.',
        'enable-mcp': 'true',
        // No credentials provided for any server
      })

      mockLoadMCPConfig.mockReturnValue([])

      await run()

      expect(mockLoadMCPConfig).toHaveBeenCalled()
      expect(mockConnect).not.toHaveBeenCalled()
      expect(mockSimpleInference).toHaveBeenCalled()
      expect(mockMultiMcpInference).not.toHaveBeenCalled()
      expect(core.warning).toHaveBeenCalledWith(
        '⚠️ No MCP servers configured in .mcp.json, falling back to simple inference',
      )
    })

    it('handles partial connection failures gracefully', async () => {
      const mockSentryClient = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: {} as any,
        tools: [{type: 'function', function: {name: 'sentry-issues'}}],
        config: {id: 'sentry', name: 'Sentry', type: 'http', url: 'sentry-test'},
        connected: true,
      }

      mockInputs({
        prompt: 'Check for errors',
        'system-prompt': 'You are an error monitoring assistant.',
        'enable-mcp': 'true',
      })

      mockLoadMCPConfig.mockReturnValue([
        {id: 'github', name: 'GitHub', type: 'http', url: 'github-test'},
        {id: 'sentry', name: 'Sentry', type: 'http', url: 'sentry-test'},
      ])

      // GitHub connection fails, Sentry succeeds
      mockConnect
        .mockResolvedValueOnce(null) // GitHub fails
        .mockResolvedValueOnce(mockSentryClient) // Sentry succeeds

      await run()

      expect(mockConnect).toHaveBeenCalledTimes(2)
      expect(mockMultiMcpInference).toHaveBeenCalledWith(
        expect.any(Object),
        [mockSentryClient], // Only Sentry client in the array
      )
      expect(core.warning).toHaveBeenCalledWith('❌ Failed to connect to GitHub')
    })

    it('processes multi-server inference with proper configuration handling', async () => {
      const mockGitHubClient = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: {} as any,
        tools: [{type: 'function', function: {name: 'github-search'}}],
        config: {id: 'github', name: 'GitHub', type: 'http', url: 'github-test'},
        connected: true,
      }

      mockInputs({
        prompt: 'Search repositories',
        'system-prompt': 'You are a repository assistant.',
        'enable-mcp': 'true',
      })

      mockLoadMCPConfig.mockReturnValue([{id: 'github', name: 'GitHub', type: 'http', url: 'github-test'}])

      mockConnect.mockResolvedValueOnce(mockGitHubClient)

      await run()

      expect(mockMultiMcpInference).toHaveBeenCalledWith(expect.any(Object), [mockGitHubClient])
      expect(core.info).toHaveBeenCalledWith('🎯 Running multi-server inference with 1 connected servers')
    })

    it('provides comprehensive server status logging', async () => {
      const mockGitHubClient = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: {} as any,
        tools: [
          {type: 'function', function: {name: 'search_issues'}},
          {type: 'function', function: {name: 'get_issue'}},
          {type: 'function', function: {name: 'search_code'}},
        ],
        config: {id: 'github', name: 'GitHub', type: 'http', url: 'github-test'},
        connected: true,
      }

      const mockDatadogClient = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: {} as any,
        tools: [
          {type: 'function', function: {name: 'get_dashboard'}},
          {type: 'function', function: {name: 'search_monitors'}},
          {type: 'function', function: {name: 'get_metrics'}},
        ],
        config: {id: 'datadog', name: 'Datadog', type: 'http', url: 'datadog-test'},
        connected: true,
      }

      mockInputs({
        prompt: 'Monitor and search',
        'system-prompt': 'You are a monitoring and search assistant.',
        'enable-mcp': 'true',
      })

      mockLoadMCPConfig.mockReturnValue([
        {id: 'github', name: 'GitHub', type: 'http', url: 'github-test'},
        {id: 'datadog', name: 'Datadog', type: 'http', url: 'datadog-test'},
      ])

      mockConnect.mockResolvedValueOnce(mockGitHubClient).mockResolvedValueOnce(mockDatadogClient)

      await run()

      expect(core.info).toHaveBeenCalledWith('🎯 Running multi-server inference with 2 connected servers')
      expect(core.info).toHaveBeenCalledWith('📊 Connected servers: GitHub, Datadog')
      expect(mockMultiMcpInference).toHaveBeenCalledWith(expect.any(Object), [mockGitHubClient, mockDatadogClient])
    })

    it('uses tool filtering when tools are specified in server config', async () => {
      const mockGitHubClient = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: {} as any,
        tools: [
          {type: 'function', function: {name: 'search_issues'}},
          {type: 'function', function: {name: 'get_issue'}},
        ],
        config: {id: 'github', name: 'GitHub', type: 'http', url: 'github-test', tools: ['search_issues', 'get_issue']},
        connected: true,
      }

      mockInputs({
        prompt: 'Search GitHub issues',
        'system-prompt': 'You are a GitHub assistant.',
        'enable-mcp': 'true',
      })

      mockLoadMCPConfig.mockReturnValue([
        {
          id: 'github',
          name: 'GitHub',
          type: 'http',
          url: 'github-test',
          tools: ['search_issues', 'get_issue'],
        },
      ])

      mockConnectWithFiltering.mockResolvedValueOnce(mockGitHubClient)

      await run()

      expect(mockLoadMCPConfig).toHaveBeenCalled()
      expect(mockConnectWithFiltering).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'github',
          name: 'GitHub',
          tools: ['search_issues', 'get_issue'],
        }),
        ['search_issues', 'get_issue'],
      )
      expect(mockConnect).not.toHaveBeenCalled()
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('Using tool filtering for GitHub: search_issues, get_issue'),
      )
      expect(mockMultiMcpInference).toHaveBeenCalledWith(expect.any(Object), [mockGitHubClient])
    })

    it('uses connectToMCPServer when no tools are specified', async () => {
      const mockGitHubClient = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: {} as any,
        tools: [
          {type: 'function', function: {name: 'search_issues'}},
          {type: 'function', function: {name: 'get_issue'}},
          {type: 'function', function: {name: 'search_code'}},
        ],
        config: {id: 'github', name: 'GitHub', type: 'http', url: 'github-test'},
        connected: true,
      }

      mockInputs({
        prompt: 'Search GitHub',
        'system-prompt': 'You are a GitHub assistant.',
        'enable-mcp': 'true',
      })

      mockLoadMCPConfig.mockReturnValue([
        {
          id: 'github',
          name: 'GitHub',
          type: 'http',
          url: 'github-test',
        },
      ])

      mockConnect.mockResolvedValueOnce(mockGitHubClient)

      await run()

      expect(mockConnect).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'github',
          name: 'GitHub',
        }),
      )
      expect(mockConnectWithFiltering).not.toHaveBeenCalled()
      expect(mockMultiMcpInference).toHaveBeenCalledWith(expect.any(Object), [mockGitHubClient])
    })

    it('handles mixed tool filtering - some servers with tools, some without', async () => {
      const mockGitHubClient = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: {} as any,
        tools: [{type: 'function', function: {name: 'search_issues'}}],
        config: {id: 'github', name: 'GitHub', type: 'http', url: 'github-test', tools: ['search_issues']},
        connected: true,
      }

      const mockDatadogClient = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: {} as any,
        tools: [
          {type: 'function', function: {name: 'get_dashboard'}},
          {type: 'function', function: {name: 'search_monitors'}},
          {type: 'function', function: {name: 'get_metrics'}},
        ],
        config: {id: 'datadog', name: 'Datadog', type: 'http', url: 'datadog-test'},
        connected: true,
      }

      mockInputs({
        prompt: 'Monitor and search',
        'system-prompt': 'You are an assistant.',
        'enable-mcp': 'true',
      })

      mockLoadMCPConfig.mockReturnValue([
        {
          id: 'github',
          name: 'GitHub',
          type: 'http',
          url: 'github-test',
          tools: ['search_issues'],
        },
        {
          id: 'datadog',
          name: 'Datadog',
          type: 'http',
          url: 'datadog-test',
        },
      ])

      mockConnectWithFiltering.mockResolvedValueOnce(mockGitHubClient)
      mockConnect.mockResolvedValueOnce(mockDatadogClient)

      await run()

      expect(mockConnectWithFiltering).toHaveBeenCalledTimes(1)
      expect(mockConnectWithFiltering).toHaveBeenCalledWith(
        expect.objectContaining({id: 'github', tools: ['search_issues']}),
        ['search_issues'],
      )
      expect(mockConnect).toHaveBeenCalledTimes(1)
      expect(mockConnect).toHaveBeenCalledWith(expect.objectContaining({id: 'datadog'}))
      expect(mockMultiMcpInference).toHaveBeenCalledWith(expect.any(Object), [mockGitHubClient, mockDatadogClient])
    })
  })
})
