import { MCPServerFactory } from './server-factory.js';
/**
 * Sentry MCP Server Factory
 */
export class SentryMCPFactory extends MCPServerFactory {
    getId() {
        return 'sentry';
    }
    getName() {
        return 'Sentry MCP';
    }
    getAllowedTools() {
        return ['get_issue_details', 'search_issues'];
    }
    isCredentialsValid(credentials) {
        return !!credentials.token;
    }
    createServerConfig(credentials) {
        this.validateCredentials(credentials, ['token']);
        return {
            id: 'sentry',
            name: 'Sentry MCP',
            type: 'stdio',
            command: 'npx',
            args: ['-y', '--no-update-notifier', '@sentry/mcp-server@latest', '--host=github.sentry.io'],
            env: {
                SENTRY_ACCESS_TOKEN: credentials.token,
                SENTRY_HOST: 'github.sentry.io',
                NO_UPDATE_NOTIFIER: '1',
                NPM_CONFIG_UPDATE_NOTIFIER: 'false',
            },
            priority: 2,
        };
    }
}
