import * as core from '@actions/core'
import * as fs from 'fs'
import * as tmp from 'tmp'
import {
  connectToMCPServer,
  MCPServerRegistry,
  GitHubMCPFactory,
  SentryMCPFactory,
  DatadogMCPFactory,
  AzureMCPFactory,
  type MCPServerCredentials,
  type MCPServerClient,
} from './mcp.js'
import {simpleInference, multiMcpInference} from './inference.js'
import {loadContentFromFileOrInput, buildInferenceRequest} from './helpers.js'
import {
  loadPromptFile,
  parseTemplateVariables,
  isPromptYamlFile,
  PromptConfig,
  parseFileTemplateVariables,
} from './prompt.js'

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

    // Get GitHub MCP token (use dedicated token if provided, otherwise fall back to main token)
    const githubMcpToken = core.getInput('github-mcp-token') || token
    const sentryToken = core.getInput('sentry-token') || process.env.SENTRY_TOKEN
    const datadogApiKey = core.getInput('datadog-api-key') || process.env.DATADOG_API_KEY
    const datadogAppKey = core.getInput('datadog-app-key') || process.env.DATADOG_APP_KEY
    const azureClientId = core.getInput('azure-client-id') || process.env.AZURE_CLIENT_ID
    const azureClientSecret = core.getInput('azure-client-secret') || process.env.AZURE_CLIENT_SECRET
    const azureTenantId = core.getInput('azure-tenant-id') || process.env.AZURE_TENANT_ID

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
    core.info(`🔍 MCP Debug: enableMcp=${enableMcp}`)

    let modelResponse: string | null = null

    if (enableMcp) {
      core.info('🚀 Starting multi-server MCP setup...')

      // Setup multi-server registry
      const registry = new MCPServerRegistry()
      registry.register(new GitHubMCPFactory())
      registry.register(new SentryMCPFactory())
      registry.register(new DatadogMCPFactory())
      registry.register(new AzureMCPFactory())

      // Build credentials map from collected credentials
      const credentialsMap = new Map<string, MCPServerCredentials>()

      if (githubMcpToken) {
        credentialsMap.set('github', {token: githubMcpToken})
      }

      if (sentryToken) {
        credentialsMap.set('sentry', {token: sentryToken})
      }

      if (datadogApiKey && datadogAppKey) {
        credentialsMap.set('datadog', {apiKey: datadogApiKey, appKey: datadogAppKey})
      }

      if (azureClientId && azureClientSecret && azureTenantId) {
        credentialsMap.set('azure', {
          clientId: azureClientId,
          clientSecret: azureClientSecret,
          tenantId: azureTenantId,
        })
      }

      // Get server availability and configurations
      const {available, unavailable, summary} = registry.createConfigsWithAvailability(credentialsMap)

      // Connect to available servers
      const connectedClients: MCPServerClient[] = []
      for (const config of available) {
        core.info(`🔗 Connecting to ${config.name}...`)
        const client = await connectToMCPServer(config)
        if (client) {
          connectedClients.push(client)
          core.info(`✅ Connected to ${config.name}`)
        } else {
          core.warning(`❌ Failed to connect to ${config.name}`)
        }
      }

      // Graceful degradation logic
      if (connectedClients.length === 0) {
        core.warning('⚠️ No MCP servers connected successfully, falling back to simple inference')
        if (unavailable.length > 0) {
          core.info(`💡 Unavailable servers: ${unavailable.map(s => `${s.serverId} (${s.reason})`).join(', ')}`)
        }
        modelResponse = await simpleInference(inferenceRequest)
      } else {
        // Check minimum server requirement (can be configured via input)
        const minServers = parseInt(core.getInput('min-servers') || '1', 10)
        if (!registry.hasMinimumServers({available, unavailable, summary}, minServers)) {
          core.warning(
            `⚠️ Only ${connectedClients.length} servers connected, but ${minServers} required. Proceeding with available servers.`,
          )
        }

        core.info(`🎯 Running multi-server inference with ${connectedClients.length} connected servers`)

        // Log server status summary
        const connectedNames = connectedClients.map(c => c.config.name).join(', ')
        core.info(`📊 Connected servers: ${connectedNames}`)

        if (unavailable.length > 0) {
          const unavailableNames = unavailable.map(s => s.serverId).join(', ')
          core.info(`📊 Unavailable servers: ${unavailableNames}`)
        }

        modelResponse = await multiMcpInference(inferenceRequest, connectedClients)
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
