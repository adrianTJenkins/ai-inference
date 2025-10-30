# MCP Configuration Migration Guide

## Overview

This guide helps you migrate from the old hardcoded MCP server configuration approach to the new `.github/.mcp.json` file-based configuration.

## What Changed?

### Before (Deprecated)

```yaml
steps:
  - name: AI Inference with MCP
    uses: actions/ai-inference@v1
    with:
      prompt: 'Your prompt here'
      enable-mcp: true
      github-mcp-token: ${{ secrets.USER_PAT }}
      sentry-token: ${{ secrets.SENTRY_TOKEN }}
```

### After (Required)

**1. Create `.github/.mcp.json` in your repository:**

```json
{
  "mcpServers": {
    "github": {
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${GITHUB_TOKEN}",
        "X-MCP-Readonly": "true"
      }
    },
    "sentry": {
      "command": "npx",
      "args": ["-y", "@sentry/mcp-server@latest", "--host=github.sentry.io"],
      "env": {
        "SENTRY_ACCESS_TOKEN": "${SENTRY_TOKEN}",
        "SENTRY_HOST": "github.sentry.io"
      }
    }
  }
}
```

**2. Update your workflow:**

```yaml
steps:
  - name: Checkout repository
    uses: actions/checkout@v4 # Required to access .github/.mcp.json

  - name: AI Inference with MCP
    uses: actions/ai-inference@v1
    with:
      prompt: 'Your prompt here'
      enable-mcp: true
    env:
      GITHUB_TOKEN: ${{ secrets.USER_PAT }}
      SENTRY_TOKEN: ${{ secrets.SENTRY_TOKEN }}
```

## Benefits

1. **Flexibility**: Add any MCP server, not just the hardcoded ones
2. **Separation of Concerns**: Configuration is in your repository, not in workflow parameters
3. **Security**: Credentials stay in GitHub Secrets, referenced via environment variables
4. **Version Control**: Track changes to MCP server configuration over time
5. **Reusability**: Use the same configuration across multiple workflows

## Configuration Format

### HTTP Servers

```json
{
  "mcpServers": {
    "serverName": {
      "url": "https://api.example.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${TOKEN}",
        "Custom-Header": "value"
      }
    }
  }
}
```

### Stdio Servers

```json
{
  "mcpServers": {
    "serverName": {
      "command": "npx",
      "args": ["-y", "@package/mcp-server", "--option", "value"],
      "env": {
        "ENV_VAR": "${SECRET_VALUE}",
        "STATIC_VAR": "static-value"
      }
    }
  }
}
```

## Environment Variable Substitution

The configuration supports two formats:

- `${VAR_NAME}` (recommended)
- `$VAR_NAME`

Variables are resolved from the environment where the action runs. Use GitHub Secrets for sensitive values:

```yaml
env:
  API_KEY: ${{ secrets.MY_API_KEY }}
  BASE_URL: ${{ vars.API_BASE_URL }}
```

## Custom Configuration Path

By default, the action looks for `.github/.mcp.json` in your repository. You can specify a custom path:

```yaml
steps:
  - name: AI Inference with Custom MCP Config
    uses: actions/ai-inference@v1
    with:
      prompt: 'Your prompt here'
      enable-mcp: true
      mcp-config-path: '.github/config/custom-mcp.json'
```

## Common Migration Patterns

### GitHub MCP Server

**Before:**

```yaml
with:
  github-mcp-token: ${{ secrets.USER_PAT }}
```

**After (.github/.mcp.json):**

```json
{
  "mcpServers": {
    "github": {
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${GITHUB_TOKEN}",
        "X-MCP-Readonly": "true"
      }
    }
  }
}
```

**Workflow:**

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.USER_PAT }}
```

### Filesystem MCP Server (New!)

With the new approach, you can now use any MCP server:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace/docs", "/workspace/src"]
    }
  }
}
```

## Troubleshooting

### "No .mcp.json file found"

Make sure you:

1. Created the `.github/.mcp.json` file in your repository
2. Added `uses: actions/checkout@v4` before the inference step

### "Failed to parse MCP server config"

Check that:

1. Your JSON is valid (use a JSON validator)
2. HTTP servers have `url` property
3. Stdio servers have `command` property
4. Environment variable names are uppercase with underscores

### "Failed to connect to server"

Verify that:

1. Environment variables are set in the workflow
2. Credentials are correct in GitHub Secrets
3. Server URLs are accessible from GitHub Actions runners

## Deprecation Timeline

- **Current**: Old input parameters have been removed. You must use `.github/.mcp.json` configuration to enable MCP servers.
- **Migration Required**: All workflows must be updated to use the new configuration file approach.

## Support

For questions or issues:

- Open an issue in the repository
- Check the README.md for updated documentation
- Review `.github/.mcp.json.example` for configuration examples
