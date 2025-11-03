import {vi, describe, it, expect, beforeEach, type MockedFunction} from 'vitest'
import * as core from '../__fixtures__/core.js'

// Mock fs module
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockExistsSync = vi.fn() as MockedFunction<any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockReadFileSync = vi.fn() as MockedFunction<any>

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}))

vi.mock('@actions/core', () => core)

// Import after mocking
const {loadMCPConfig, substituteEnvVars, processConfigWithEnvVars} = await import('../src/mcp-config.js')

describe('mcp-config.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear GITHUB_WORKSPACE for most tests
    delete process.env.GITHUB_WORKSPACE
  })

  describe('loadMCPConfig', () => {
    it('returns empty array when .mcp.json file does not exist', () => {
      mockExistsSync.mockReturnValue(false)

      const result = loadMCPConfig()

      expect(result).toEqual([])
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('No .mcp.json file found'))
    })

    it('loads configuration from .mcp.json file in workspace', () => {
      process.env.GITHUB_WORKSPACE = '/workspace'
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          mcpServers: {
            github: {
              url: 'https://api.githubcopilot.com/mcp/',
              headers: {
                Authorization: 'Bearer test-token',
              },
            },
          },
        }),
      )

      const result = loadMCPConfig()

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        id: 'github',
        name: 'github',
        type: 'http',
        url: 'https://api.githubcopilot.com/mcp/',
        headers: {
          Authorization: 'Bearer test-token',
        },
        priority: 1,
      })
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('Loading MCP configuration from /workspace/.github/.mcp.json'),
      )
    })

    it('loads stdio server configuration', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          mcpServers: {
            filesystem: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir'],
              env: {
                DEBUG: '1',
              },
            },
          },
        }),
      )

      const result = loadMCPConfig()

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        id: 'filesystem',
        name: 'filesystem',
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir'],
        env: {
          DEBUG: '1',
        },
        priority: 1,
      })
    })

    it('loads multiple server configurations with correct priority', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          mcpServers: {
            github: {
              url: 'https://api.githubcopilot.com/mcp/',
              headers: {},
            },
            sentry: {
              command: 'npx',
              args: ['-y', '@sentry/mcp-server'],
            },
            datadog: {
              url: 'https://mcp.datadoghq.com/api/unstable/mcp-server/mcp',
              headers: {},
            },
          },
        }),
      )

      const result = loadMCPConfig()

      expect(result).toHaveLength(3)
      expect(result[0].priority).toBe(1)
      expect(result[1].priority).toBe(2)
      expect(result[2].priority).toBe(3)
    })

    it('uses custom config path when provided', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          mcpServers: {
            test: {
              url: 'https://test.com',
              headers: {},
            },
          },
        }),
      )

      const result = loadMCPConfig('/custom/path/.mcp.json')

      expect(mockExistsSync).toHaveBeenCalledWith('/custom/path/.mcp.json')
      expect(mockReadFileSync).toHaveBeenCalledWith('/custom/path/.mcp.json', 'utf-8')
      expect(result).toHaveLength(1)
    })

    it('handles invalid JSON gracefully', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('invalid json{')

      const result = loadMCPConfig()

      expect(result).toEqual([])
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to load MCP configuration'))
    })

    it('handles missing mcpServers key', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({}))

      const result = loadMCPConfig()

      expect(result).toEqual([])
      expect(core.warning).toHaveBeenCalledWith('Invalid .mcp.json format: mcpServers key is missing or not an object')
    })

    it('handles server config without required fields', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          mcpServers: {
            invalid: {
              // Missing both url and command
              headers: {},
            },
          },
        }),
      )

      const result = loadMCPConfig()

      expect(result).toEqual([])
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse MCP server config for invalid'),
      )
    })

    it('substitutes environment variables in configuration', () => {
      process.env.TEST_TOKEN = 'my-secret-token'
      process.env.TEST_URL = 'https://example.com'

      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          mcpServers: {
            test: {
              url: '${TEST_URL}/mcp/',
              headers: {
                Authorization: 'Bearer ${TEST_TOKEN}',
              },
            },
          },
        }),
      )

      const result = loadMCPConfig()

      expect(result).toHaveLength(1)
      expect(result[0].url).toBe('https://example.com/mcp/')
      expect(result[0].headers?.Authorization).toBe('Bearer my-secret-token')

      delete process.env.TEST_TOKEN
      delete process.env.TEST_URL
    })
  })

  describe('substituteEnvVars', () => {
    it('substitutes ${VAR_NAME} format', () => {
      process.env.MY_VAR = 'test-value'

      const result = substituteEnvVars('Token: ${MY_VAR}')

      expect(result).toBe('Token: test-value')
      delete process.env.MY_VAR
    })

    it('substitutes $VAR_NAME format', () => {
      process.env.MY_VAR = 'test-value'

      const result = substituteEnvVars('Token: $MY_VAR')

      expect(result).toBe('Token: test-value')
      delete process.env.MY_VAR
    })

    it('leaves undefined variables unchanged', () => {
      const result = substituteEnvVars('Token: ${UNDEFINED_VAR}')

      expect(result).toBe('Token: ${UNDEFINED_VAR}')
    })

    it('handles multiple variable substitutions', () => {
      process.env.VAR1 = 'value1'
      process.env.VAR2 = 'value2'

      const result = substituteEnvVars('${VAR1} and ${VAR2}')

      expect(result).toBe('value1 and value2')
      delete process.env.VAR1
      delete process.env.VAR2
    })

    it('handles mixed variable formats', () => {
      process.env.VAR1 = 'value1'
      process.env.VAR2 = 'value2'

      const result = substituteEnvVars('${VAR1} and $VAR2')

      expect(result).toBe('value1 and value2')
      delete process.env.VAR1
      delete process.env.VAR2
    })
  })

  describe('processConfigWithEnvVars', () => {
    it('processes command with env vars', () => {
      process.env.CMD = 'npx'

      const config = {
        mcpServers: {
          test: {
            command: '${CMD}',
            args: ['test'],
          },
        },
      }

      const result = processConfigWithEnvVars(config)

      expect(result.mcpServers.test.command).toBe('npx')
      delete process.env.CMD
    })

    it('processes args with env vars', () => {
      process.env.ARG = 'value'

      const config = {
        mcpServers: {
          test: {
            command: 'npx',
            args: ['--flag', '${ARG}'],
          },
        },
      }

      const result = processConfigWithEnvVars(config)

      expect(result.mcpServers.test.args).toEqual(['--flag', 'value'])
      delete process.env.ARG
    })

    it('processes env object with env vars', () => {
      process.env.TOKEN = 'secret'

      const config = {
        mcpServers: {
          test: {
            command: 'npx',
            args: [],
            env: {
              MY_TOKEN: '${TOKEN}',
            },
          },
        },
      }

      const result = processConfigWithEnvVars(config)

      expect(result.mcpServers.test.env?.MY_TOKEN).toBe('secret')
      delete process.env.TOKEN
    })

    it('processes url with env vars', () => {
      process.env.API_URL = 'https://api.example.com'

      const config = {
        mcpServers: {
          test: {
            url: '${API_URL}/mcp',
          },
        },
      }

      const result = processConfigWithEnvVars(config)

      expect(result.mcpServers.test.url).toBe('https://api.example.com/mcp')
      delete process.env.API_URL
    })

    it('processes headers with env vars', () => {
      process.env.AUTH_TOKEN = 'Bearer token123'

      const config = {
        mcpServers: {
          test: {
            url: 'https://example.com',
            headers: {
              Authorization: '${AUTH_TOKEN}',
            },
          },
        },
      }

      const result = processConfigWithEnvVars(config)

      expect(result.mcpServers.test.headers?.Authorization).toBe('Bearer token123')
      delete process.env.AUTH_TOKEN
    })
  })

  describe('tools filtering configuration', () => {
    it('loads tools array from server configuration', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          mcpServers: {
            github: {
              url: 'https://api.githubcopilot.com/mcp/',
              headers: {
                Authorization: 'Bearer test-token',
              },
              tools: ['list_files', 'create_file', 'read_file'],
            },
          },
        }),
      )

      const result = loadMCPConfig()

      expect(result).toHaveLength(1)
      expect(result[0].tools).toEqual(['list_files', 'create_file', 'read_file'])
    })

    it('handles configuration without tools array', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          mcpServers: {
            github: {
              url: 'https://api.githubcopilot.com/mcp/',
              headers: {},
            },
          },
        }),
      )

      const result = loadMCPConfig()

      expect(result).toHaveLength(1)
      expect(result[0].tools).toBeUndefined()
    })

    it('handles empty tools array', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          mcpServers: {
            github: {
              url: 'https://api.githubcopilot.com/mcp/',
              headers: {},
              tools: [],
            },
          },
        }),
      )

      const result = loadMCPConfig()

      expect(result).toHaveLength(1)
      expect(result[0].tools).toEqual([])
    })

    it('loads multiple servers with different tool configurations', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          mcpServers: {
            github: {
              url: 'https://api.githubcopilot.com/mcp/',
              headers: {},
              tools: ['github_list_repos', 'github_get_issue'],
            },
            filesystem: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-filesystem', '/path'],
              tools: ['list_directory', 'read_file', 'write_file'],
            },
            unrestricted: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-other'],
            },
          },
        }),
      )

      const result = loadMCPConfig()

      expect(result).toHaveLength(3)
      expect(result[0].tools).toEqual(['github_list_repos', 'github_get_issue'])
      expect(result[1].tools).toEqual(['list_directory', 'read_file', 'write_file'])
      expect(result[2].tools).toBeUndefined()
    })

    it('preserves tools array in processConfigWithEnvVars', () => {
      const config = {
        mcpServers: {
          test: {
            url: 'https://example.com',
            tools: ['tool1', 'tool2', 'tool3'],
          },
        },
      }

      const result = processConfigWithEnvVars(config)

      expect(result.mcpServers.test.tools).toEqual(['tool1', 'tool2', 'tool3'])
    })
  })
})
