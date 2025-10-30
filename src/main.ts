import * as core from '@actions/core'
import * as fs from 'fs'
import * as tmp from 'tmp'
import {connectToMCPServer, connectToMCPServerWithFiltering, type MCPServerClient} from './mcp.js'
import {simpleInference, multiMcpInference} from './inference.js'
import {loadContentFromFileOrInput, buildInferenceRequest} from './helpers.js'
import {
  loadPromptFile,
  parseTemplateVariables,
  isPromptYamlFile,
  PromptConfig,
  parseFileTemplateVariables,
} from './prompt.js'
import {loadMCPConfig} from './mcp-config.js'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  let responseFile: tmp.FileResult | null = null

  // Set up graceful cleanup for temporary files on process exit
  tmp.setGracefulCleanup()

  try {
    const promptFilePath = core.getInput('prompt-file')
    const inputVariables = core.getInput('input')
    const fileInputVariables = core.getInput('file_input')

    let promptConfig: PromptConfig | undefined = undefined
    let systemPrompt: string | undefined = undefined
    let prompt: string | undefined = undefined

    // Check if we're using a prompt YAML file
    if (promptFilePath && isPromptYamlFile(promptFilePath)) {
      core.info('Using prompt YAML file format')

      // Parse template variables from both string inputs and file-based inputs
      const stringVars = parseTemplateVariables(inputVariables)
      const fileVars = parseFileTemplateVariables(fileInputVariables)
      const templateVariables = {...stringVars, ...fileVars}

      // Load and process prompt file
      promptConfig = loadPromptFile(promptFilePath, templateVariables)
    } else {
      // Use legacy format
      core.info('Using legacy prompt format')

      prompt = loadContentFromFileOrInput('prompt-file', 'prompt')
      systemPrompt = loadContentFromFileOrInput('system-prompt-file', 'system-prompt', 'You are a helpful assistant')
    }

    // Get common parameters
    const modelName = promptConfig?.model || core.getInput('model')
    const maxTokens = parseInt(core.getInput('max-tokens'), 10)

    const token = process.env['GITHUB_TOKEN'] || core.getInput('token')
    if (token === undefined) {
      throw new Error('GITHUB_TOKEN is not set')
    }

    const endpoint = core.getInput('endpoint')

    // Build the inference request with pre-processed messages and response format
    const inferenceRequest = buildInferenceRequest(
      promptConfig,
      systemPrompt,
      prompt,
      modelName,
      maxTokens,
      endpoint,
      token,
    )

    const enableMcp = core.getBooleanInput('enable-mcp') || core.getBooleanInput('enable-github-mcp') || false

    // Debug logging for MCP enablement
    core.info(
      `🔍 MCP Debug: enable-mcp=${core.getInput('enable-mcp')}, enable-github-mcp=${core.getInput('enable-github-mcp')}`,
    )
    core.info(
      `🔍 MCP Debug: Parsed enable-mcp=${core.getBooleanInput('enable-mcp')}, enable-github-mcp=${core.getBooleanInput('enable-github-mcp')}`,
    )
    core.info(`🔍 MCP Debug: Final enableMcp=${enableMcp}`)

    let modelResponse: string | null = null

    if (enableMcp) {
      core.info('🚀 Starting MCP setup from configuration file...')

      // Load MCP server configurations from .mcp.json
      const mcpConfigPath = core.getInput('mcp-config-path') || undefined
      const serverConfigs = loadMCPConfig(mcpConfigPath)

      if (serverConfigs.length === 0) {
        core.warning('⚠️ No MCP servers configured in .mcp.json, falling back to simple inference')
        modelResponse = await simpleInference(inferenceRequest)
      } else {
        // Connect to configured servers
        const connectedClients: MCPServerClient[] = []
        for (const config of serverConfigs) {
          core.info(`🔗 Connecting to ${config.name}...`)
          let client: MCPServerClient | null = null

          // Use filtering if tools are specified in config
          if (config.tools && config.tools.length > 0) {
            core.info(`🔧 Using tool filtering for ${config.name}: ${config.tools.join(', ')}`)
            client = await connectToMCPServerWithFiltering(config, config.tools)
          } else {
            client = await connectToMCPServer(config)
          }

          if (client) {
            connectedClients.push(client)
          } else {
            core.warning(`❌ Failed to connect to ${config.name}`)
          }
        }

        // Graceful degradation logic
        if (connectedClients.length === 0) {
          core.warning('⚠️ No MCP servers connected successfully, falling back to simple inference')
          modelResponse = await simpleInference(inferenceRequest)
        } else {
          core.info(`🎯 Running multi-server inference with ${connectedClients.length} connected servers`)

          // Log server status summary
          const connectedNames = connectedClients.map(c => c.config.name).join(', ')
          core.info(`📊 Connected servers: ${connectedNames}`)

          modelResponse = await multiMcpInference(inferenceRequest, connectedClients)
        }
      }
    } else {
      core.info('📝 Running simple inference without MCP tools')
      modelResponse = await simpleInference(inferenceRequest)
    }

    core.setOutput('response', modelResponse || '')

    // Create a secure temporary file instead of using the temp directory directly
    responseFile = tmp.fileSync({
      prefix: 'modelResponse-',
      postfix: '.txt',
    })

    core.setOutput('response-file', responseFile.name)

    if (modelResponse && modelResponse !== '') {
      fs.writeFileSync(responseFile.name, modelResponse, 'utf-8')
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed(`An unexpected error occurred: ${JSON.stringify(error, null, 2)}`)
    }
    // Force exit to prevent hanging on open connections
    process.exit(1)
  } finally {
    // Explicit cleanup of temporary file if it was created
    if (responseFile) {
      try {
        responseFile.removeCallback()
      } catch (cleanupError) {
        // Log cleanup errors but don't fail the action
        core.warning(`Failed to cleanup temporary file: ${cleanupError}`)
      }
    }
  }

  // Force exit to prevent hanging on open connections
  process.exit(0)
}
