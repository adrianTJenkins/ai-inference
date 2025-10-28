import { MCPServerFactory } from './server-factory.js';
/**
 * Azure MCP Server Factory
 */
export class AzureMCPFactory extends MCPServerFactory {
    getId() {
        return 'azure';
    }
    getName() {
        return 'Azure MCP';
    }
    getAllowedTools() {
        return ['execute_kql', 'get_resource_logs'];
    }
    isCredentialsValid(credentials) {
        // Azure MCP requires Service Principal authentication
        return !!(credentials.clientId && credentials.clientSecret && credentials.tenantId);
    }
    createServerConfig(credentials) {
        if (!this.isCredentialsValid(credentials)) {
            throw new Error('Azure MCP requires clientId, clientSecret, and tenantId');
        }
        return {
            id: 'azure',
            name: 'Azure MCP',
            type: 'stdio',
            command: 'npx',
            args: ['-y', '--no-update-notifier', '@azure/mcp@latest', 'server', 'start'],
            env: {
                AZURE_CLIENT_ID: credentials.clientId,
                AZURE_CLIENT_SECRET: credentials.clientSecret,
                AZURE_TENANT_ID: credentials.tenantId,
                NO_UPDATE_NOTIFIER: '1',
                NPM_CONFIG_UPDATE_NOTIFIER: 'false',
            },
            priority: 4,
        };
    }
}
