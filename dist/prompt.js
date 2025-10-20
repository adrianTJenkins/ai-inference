import * as core from '@actions/core';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
/**
 * Parse template variables from YAML input string
 */
export function parseTemplateVariables(input) {
    if (!input.trim()) {
        return {};
    }
    try {
        const parsed = yaml.load(input);
        if (typeof parsed !== 'object' || parsed === null) {
            throw new Error('Template variables must be a YAML object');
        }
        return parsed;
    }
    catch (error) {
        throw new Error(`Failed to parse template variables: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
/**
 * Parse file-based template variables from YAML input string. The YAML should map
 * variable names to file paths. File contents are read and returned as variables.
 */
export function parseFileTemplateVariables(fileInput) {
    if (!fileInput.trim()) {
        return {};
    }
    try {
        const parsed = yaml.load(fileInput);
        if (typeof parsed !== 'object' || parsed === null) {
            throw new Error('File template variables must be a YAML object');
        }
        const result = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value !== 'string') {
                throw new Error(`File template variable '${key}' must be a string file path`);
            }
            const filePath = value;
            if (!fs.existsSync(filePath)) {
                throw new Error(`File for template variable '${key}' was not found: ${filePath}`);
            }
            try {
                result[key] = fs.readFileSync(filePath, 'utf-8');
            }
            catch (err) {
                throw new Error(`Failed to read file for template variable '${key}' at path '${filePath}': ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
        }
        return result;
    }
    catch (error) {
        throw new Error(`Failed to parse file template variables: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
/**
 * Replace template variables in text using {{variable}} syntax
 */
export function replaceTemplateVariables(text, variables) {
    return text.replace(/\{\{([\w.-]+)\}\}/g, (match, variableName) => {
        if (variableName in variables) {
            return variables[variableName];
        }
        core.warning(`Template variable '${variableName}' not found in input variables`);
        return match; // Return the original placeholder if variable not found
    });
}
/**
 * Load and parse a prompt YAML file with template variable substitution
 */
export function loadPromptFile(filePath, templateVariables = {}) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Prompt file not found: ${filePath}`);
    }
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    // Apply template variable substitution
    const processedContent = replaceTemplateVariables(fileContent, templateVariables);
    try {
        const config = yaml.load(processedContent);
        if (!config.messages || !Array.isArray(config.messages)) {
            throw new Error('Prompt file must contain a "messages" array');
        }
        // Validate messages
        for (const message of config.messages) {
            if (!message.role || !message.content) {
                throw new Error('Each message must have "role" and "content" properties');
            }
            if (!['system', 'user', 'assistant'].includes(message.role)) {
                throw new Error(`Invalid message role: ${message.role}`);
            }
        }
        return config;
    }
    catch (error) {
        throw new Error(`Failed to parse prompt file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
/**
 * Check if a file is a prompt YAML file based on extension
 */
export function isPromptYamlFile(filePath) {
    return filePath.endsWith('.prompt.yml') || filePath.endsWith('.prompt.yaml');
}
