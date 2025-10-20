import { MCPServerFactory } from './base.js';
/**
 * Datadog MCP Server Factory
 */
export class DatadogMCPFactory extends MCPServerFactory {
    getId() {
        return 'datadog';
    }
    getName() {
        return 'Datadog MCP';
    }
    isCredentialsValid(credentials) {
        return !!credentials.apiKey && !!credentials.appKey;
    }
    createServerConfig(credentials) {
        this.validateCredentials(credentials, ['apiKey', 'appKey']);
        return {
            id: 'datadog',
            name: 'Datadog MCP',
            type: 'http',
            url: 'https://mcp.datadoghq.com/api/unstable/mcp-server/mcp',
            headers: {
                DD_API_KEY: credentials.apiKey,
                DD_APPLICATION_KEY: credentials.appKey,
            },
            priority: 3,
        };
    }
}
