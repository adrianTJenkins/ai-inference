import * as core from '@actions/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPServerRegistry, GitHubMCPFactory, SentryMCPFactory, DatadogMCPFactory, AzureMCPFactory, } from './mcp-factories/index.js';
// Factory classes are now imported from the mcp-factories module
// Re-export for backward compatibility
export { MCPServerFactory, MCPServerRegistry, GitHubMCPFactory, SentryMCPFactory, DatadogMCPFactory, AzureMCPFactory, } from './mcp-factories/index.js';
/**
 * Generic function to connect to any MCP server based on configuration
 */
export async function connectToMCPServer(config) {
    core.info(`Connecting to ${config.name} server...`);
    let transport;
    try {
        // Create transport based on server type
        if (config.type === 'http') {
            if (!config.url) {
                throw new Error(`HTTP server ${config.name} requires URL`);
            }
            transport = new StreamableHTTPClientTransport(new URL(config.url), {
                requestInit: {
                    headers: config.headers || {},
                },
            });
        }
        else if (config.type === 'stdio') {
            if (!config.command || !config.args) {
                throw new Error(`Stdio server ${config.name} requires command and args`);
            }
            // Filter out undefined values from environment
            const envVars = {};
            if (config.env) {
                for (const [key, value] of Object.entries(config.env)) {
                    if (value !== undefined) {
                        envVars[key] = value;
                    }
                }
            }
            transport = new StdioClientTransport({
                command: config.command,
                args: config.args,
                env: {
                    ...envVars,
                },
            });
        }
        else {
            throw new Error(`Unsupported transport type: ${config.type}`);
        }
        const client = new Client({
            name: 'ai-inference-action',
            version: '1.0.0',
            transport,
        });
        await client.connect(transport);
        core.info(`Successfully connected to ${config.name} server`);
        const toolsResponse = await client.listTools();
        core.info(`Retrieved ${toolsResponse.tools?.length || 0} tools from ${config.name} server`);
        // Map MCP tools → Azure AI Inference tool definitions
        const tools = (toolsResponse.tools || []).map(t => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.inputSchema,
            },
        }));
        core.info(`Mapped ${tools.length} tools from ${config.name} for Azure AI Inference`);
        return {
            config,
            client,
            tools,
            connected: true,
        };
    }
    catch (mcpError) {
        core.warning(`Failed to connect to ${config.name} server: ${mcpError}`);
        return null;
    }
}
/**
 * Connect to an MCP server with tool filtering based on factory configuration
 */
export async function connectToMCPServerWithFiltering(config, allowedTools) {
    core.info(`Connecting to ${config.name} server with tool filtering...`);
    let transport;
    try {
        // Create transport based on server type
        if (config.type === 'http') {
            if (!config.url) {
                throw new Error(`HTTP server ${config.name} requires URL`);
            }
            transport = new StreamableHTTPClientTransport(new URL(config.url), {
                requestInit: {
                    headers: config.headers || {},
                },
            });
        }
        else if (config.type === 'stdio') {
            if (!config.command || !config.args) {
                throw new Error(`Stdio server ${config.name} requires command and args`);
            }
            // Filter out undefined values from environment
            const envVars = {};
            if (config.env) {
                for (const [key, value] of Object.entries(config.env)) {
                    if (value !== undefined) {
                        envVars[key] = value;
                    }
                }
            }
            transport = new StdioClientTransport({
                command: config.command,
                args: config.args,
                env: {
                    ...envVars,
                },
            });
        }
        else {
            throw new Error(`Unsupported transport type: ${config.type}`);
        }
        const client = new Client({
            name: 'ai-inference-action',
            version: '1.0.0',
            transport,
        });
        await client.connect(transport);
        core.info(`Successfully connected to ${config.name} server`);
        const toolsResponse = await client.listTools();
        core.info(`Retrieved ${toolsResponse.tools?.length || 0} tools from ${config.name} server`);
        // Filter tools based on allowed tools list
        const filteredTools = (toolsResponse.tools || []).filter(t => allowedTools.includes(t.name));
        // Map MCP tools → Azure AI Inference tool definitions
        const tools = filteredTools.map(t => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.inputSchema,
            },
        }));
        core.info(`✅ Connected to ${config.name} with ${tools.length} filtered tools: ${tools.map(t => t.function.name).join(', ')}`);
        return {
            config,
            client,
            tools,
            connected: true,
        };
    }
    catch (mcpError) {
        core.warning(`Failed to connect to ${config.name} server: ${mcpError}`);
        return null;
    }
}
/**
 * Create server configurations using the factory pattern
 * (Backward compatibility wrapper)
 */
export function createServerConfigs(githubToken, sentryToken, datadogApiKey, datadogAppKey, azureClientId, azureClientSecret, azureTenantId) {
    const registry = new MCPServerRegistry();
    // Register all available factories
    registry.register(new GitHubMCPFactory());
    registry.register(new SentryMCPFactory());
    registry.register(new DatadogMCPFactory());
    registry.register(new AzureMCPFactory());
    // Map legacy parameters to credentials
    const credentialsMap = new Map();
    if (githubToken) {
        credentialsMap.set('github', { token: githubToken });
    }
    if (sentryToken) {
        credentialsMap.set('sentry', { token: sentryToken });
    }
    if (datadogApiKey && datadogAppKey) {
        credentialsMap.set('datadog', { apiKey: datadogApiKey, appKey: datadogAppKey });
    }
    if (azureClientId && azureClientSecret && azureTenantId) {
        credentialsMap.set('azure', { clientId: azureClientId, clientSecret: azureClientSecret, tenantId: azureTenantId });
    }
    return registry.createConfigs(credentialsMap);
}
/**
 * Create server configurations using factory pattern with credentials map
 * (New recommended approach)
 */
export function createServerConfigsFromCredentials(credentialsMap) {
    const registry = new MCPServerRegistry();
    // Register all available factories
    registry.register(new GitHubMCPFactory());
    registry.register(new SentryMCPFactory());
    registry.register(new DatadogMCPFactory());
    registry.register(new AzureMCPFactory());
    return registry.createConfigs(credentialsMap);
}
/**
 * Connect to the GitHub MCP server and retrieve available tools
 * (Backward compatibility wrapper around connectToMCPServer)
 */
export async function connectToGitHubMCP(token) {
    const config = {
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
    };
    return connectToMCPServer(config);
}
/**
 * Execute a single tool call via GitHub MCP
 */
export async function executeToolCall(githubMcpClient, toolCall) {
    core.info(`Executing GitHub MCP tool: ${toolCall.function.name} with args: ${toolCall.function.arguments}`);
    try {
        const args = JSON.parse(toolCall.function.arguments);
        const result = await githubMcpClient.callTool({
            name: toolCall.function.name,
            arguments: args,
        });
        core.info(`GitHub MCP tool ${toolCall.function.name} executed successfully`);
        return {
            tool_call_id: toolCall.id,
            role: 'tool',
            name: toolCall.function.name,
            content: JSON.stringify(result.content),
        };
    }
    catch (toolError) {
        core.warning(`Failed to execute GitHub MCP tool ${toolCall.function.name}: ${toolError}`);
        return {
            tool_call_id: toolCall.id,
            role: 'tool',
            name: toolCall.function.name,
            content: `Error: ${toolError}`,
        };
    }
}
/**
 * Execute all tool calls from a response via GitHub MCP
 */
export async function executeToolCalls(githubMcpClient, toolCalls) {
    const toolResults = [];
    for (const toolCall of toolCalls) {
        const result = await executeToolCall(githubMcpClient, toolCall);
        toolResults.push(result);
    }
    return toolResults;
}
