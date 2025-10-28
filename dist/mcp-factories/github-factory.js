import { MCPServerFactory } from './server-factory.js';
/**
 * GitHub MCP Server Factory
 */
export class GitHubMCPFactory extends MCPServerFactory {
    getId() {
        return 'github';
    }
    getName() {
        return 'GitHub MCP';
    }
    getAllowedTools() {
        return ['search_issues', 'get_issue', 'search_code'];
    }
    isCredentialsValid(credentials) {
        return !!credentials.token;
    }
    createServerConfig(credentials) {
        this.validateCredentials(credentials, ['token']);
        return {
            id: 'github',
            name: 'GitHub MCP',
            type: 'http',
            url: 'https://api.githubcopilot.com/mcp/',
            headers: {
                Authorization: `Bearer ${credentials.token}`,
                'X-MCP-Readonly': 'true',
            },
            readonly: true,
            priority: 1,
        };
    }
}
