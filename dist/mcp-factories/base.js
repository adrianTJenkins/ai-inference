import * as core from '@actions/core';
/**
 * Abstract factory for creating MCP server configurations
 */
export class MCPServerFactory {
    validateCredentials(credentials, requiredFields) {
        for (const field of requiredFields) {
            if (!credentials[field]) {
                throw new Error(`${this.getName()} requires ${field}`);
            }
        }
    }
}
/**
 * Registry for managing MCP server factories
 */
export class MCPServerRegistry {
    factories = new Map();
    register(factory) {
        this.factories.set(factory.getId(), factory);
    }
    getFactory(serverId) {
        return this.factories.get(serverId);
    }
    getAllFactories() {
        return Array.from(this.factories.values());
    }
    createConfigs(credentialsMap) {
        const configs = [];
        for (const factory of this.getAllFactories()) {
            const serverId = factory.getId();
            const credentials = credentialsMap.get(serverId);
            if (credentials && factory.isCredentialsValid(credentials)) {
                try {
                    const config = factory.createServerConfig(credentials);
                    configs.push(config);
                }
                catch (error) {
                    core.warning(`Failed to create config for ${factory.getName()}: ${error}`);
                }
            }
        }
        // Sort by priority
        return configs.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    }
}
