import * as core from '@actions/core';
import OpenAI from 'openai';
/**
 * Simple one-shot inference without tools
 */
export async function simpleInference(request) {
    core.info('Running simple inference without tools');
    const client = new OpenAI({
        apiKey: request.token,
        baseURL: request.endpoint,
    });
    const chatCompletionRequest = {
        messages: request.messages,
        max_tokens: request.maxTokens,
        model: request.modelName,
    };
    // Add response format if specified
    if (request.responseFormat) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chatCompletionRequest.response_format = request.responseFormat;
    }
    const response = await chatCompletion(client, chatCompletionRequest, 'simpleInference');
    const modelResponse = response.choices[0]?.message?.content;
    core.info(`Model response: ${modelResponse || 'No response content'}`);
    return modelResponse || null;
}
/**
 * Multi-server MCP-enabled inference with tool execution loop
 */
export async function multiMcpInference(request, mcpClients) {
    core.info(`Running multi-server MCP inference with ${mcpClients.length} connected servers`);
    if (mcpClients.length === 0) {
        core.warning('No MCP clients provided, falling back to simple inference');
        return simpleInference(request);
    }
    const client = new OpenAI({
        apiKey: request.token,
        baseURL: request.endpoint,
    });
    // Aggregate all tools from all servers with server identification
    const allTools = mcpClients.flatMap(mcpClient => mcpClient.tools.map(tool => ({
        ...tool,
        // Add metadata to track which server owns this tool
        serverId: mcpClient.config.id,
        serverName: mcpClient.config.name,
    })));
    // Create tool-to-server mapping for routing tool calls
    const toolToServer = new Map();
    mcpClients.forEach(mcpClient => {
        mcpClient.tools.forEach(tool => {
            toolToServer.set(tool.function.name, mcpClient);
        });
    });
    core.info(`Aggregated ${allTools.length} tools from ${mcpClients.length} servers`);
    // Start with the pre-processed messages
    const messages = [...request.messages];
    let iterationCount = 0;
    const maxIterations = 5; // Prevent infinite loops
    let finalMessage = false;
    while (iterationCount < maxIterations) {
        iterationCount++;
        core.info(`MCP inference iteration ${iterationCount}`);
        const chatCompletionRequest = {
            messages: messages,
            max_tokens: request.maxTokens,
            model: request.modelName,
        };
        // Add response format if specified (only on final iteration to avoid conflicts with tool calls)
        if (finalMessage && request.responseFormat) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            chatCompletionRequest.response_format = request.responseFormat;
        }
        else {
            // Use aggregated tools from all servers
            chatCompletionRequest.tools = allTools;
        }
        try {
            const response = await chatCompletion(client, chatCompletionRequest, `multiMcpInference iteration ${iterationCount}`);
            const assistantMessage = response.choices[0]?.message;
            const modelResponse = assistantMessage?.content;
            const toolCalls = assistantMessage?.tool_calls;
            core.info(`Model response: ${modelResponse || 'No response content'}`);
            messages.push({
                role: 'assistant',
                content: modelResponse || '',
                ...(toolCalls && { tool_calls: toolCalls }),
            });
            if (!toolCalls || toolCalls.length === 0) {
                core.info('No tool calls requested, ending multi-MCP inference loop');
                if (request.responseFormat && !finalMessage) {
                    core.info('Making one more multi-MCP loop with the requested response format...');
                    messages.push({
                        role: 'user',
                        content: `Please provide your response in the exact ${request.responseFormat.type} format specified.`,
                    });
                    finalMessage = true;
                    continue;
                }
                else {
                    return modelResponse || null;
                }
            }
            core.info(`Model requested ${toolCalls.length} tool calls`);
            // Route tool calls to appropriate servers
            const toolResults = [];
            for (const toolCall of toolCalls) {
                const targetServer = toolToServer.get(toolCall.function.name);
                if (!targetServer) {
                    core.warning(`Tool ${toolCall.function.name} not found in any connected server`);
                    toolResults.push({
                        tool_call_id: toolCall.id,
                        role: 'tool',
                        name: toolCall.function.name,
                        content: `Error: Tool ${toolCall.function.name} not available on any connected server`,
                    });
                    continue;
                }
                core.info(`Routing tool ${toolCall.function.name} to server ${targetServer.config.name}`);
                try {
                    const args = JSON.parse(toolCall.function.arguments);
                    const result = await targetServer.client.callTool({
                        name: toolCall.function.name,
                        arguments: args,
                    });
                    // Extract text content from MCP response
                    let contentText = '';
                    if (result.content && Array.isArray(result.content)) {
                        contentText = result.content
                            .filter((item) => item.type === 'text' && item.text)
                            .map((item) => item.text)
                            .join('\n');
                    }
                    else if (typeof result.content === 'string') {
                        contentText = result.content;
                    }
                    else {
                        contentText = JSON.stringify(result.content);
                    }
                    toolResults.push({
                        tool_call_id: toolCall.id,
                        role: 'tool',
                        name: toolCall.function.name,
                        content: contentText,
                    });
                    core.info(`Tool ${toolCall.function.name} executed successfully on ${targetServer.config.name}`);
                }
                catch (toolError) {
                    core.warning(`Failed to execute tool ${toolCall.function.name} on ${targetServer.config.name}: ${toolError}`);
                    toolResults.push({
                        tool_call_id: toolCall.id,
                        role: 'tool',
                        name: toolCall.function.name,
                        content: `Error: ${toolError}`,
                    });
                }
            }
            messages.push(...toolResults);
            core.info('Multi-server tool results added, continuing conversation...');
        }
        catch (error) {
            core.error(`OpenAI API error: ${error}`);
            throw error;
        }
    }
    core.warning(`Multi-MCP inference loop exceeded maximum iterations (${maxIterations})`);
    // Return the last assistant message content
    const lastAssistantMessage = messages
        .slice()
        .reverse()
        .find(msg => msg.role === 'assistant');
    return lastAssistantMessage?.content || null;
}
/**
 * GitHub MCP-enabled inference with tool execution loop
 * (Backward compatibility - now wraps multiMcpInference)
 */
export async function mcpInference(request, githubMcpClient) {
    core.info('Running GitHub MCP inference with tools (backward compatibility mode)');
    // Use the new multi-server function with a single GitHub client
    return multiMcpInference(request, [githubMcpClient]);
}
/**
 * Wrapper around OpenAI chat.completions.create with defensive handling for cases where
 * the SDK returns a raw string (e.g., unexpected content-type or streaming body) instead of
 * a parsed object. Ensures an object with a 'choices' array is returned or throws a descriptive error.
 */
async function chatCompletion(client, params, context) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let response = await client.chat.completions.create(params);
        core.debug(`${context}: raw response typeof=${typeof response}`);
        if (typeof response === 'string') {
            // Attempt to parse if we unexpectedly received a string
            try {
                response = JSON.parse(response);
            }
            catch (e) {
                const preview = response.slice(0, 400);
                throw new Error(`${context}: Chat completion response was a string and not valid JSON (${e.message}). Preview: ${preview}`);
            }
        }
        if (!response || typeof response !== 'object' || !('choices' in response)) {
            const preview = JSON.stringify(response)?.slice(0, 800);
            throw new Error(`${context}: Unexpected response shape (no choices). Preview: ${preview}`);
        }
        return response;
    }
    catch (err) {
        // Re-throw after logging for upstream handling
        core.error(`${context}: chatCompletion failed: ${err}`);
        throw err;
    }
}
