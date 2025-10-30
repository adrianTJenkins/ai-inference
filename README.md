# AI Inference in GitHub Actions

[![GitHub Super-Linter](https://github.com/actions/typescript-action/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/actions/typescript-action/actions/workflows/ci.yml/badge.svg)
[![Check dist/](https://github.com/actions/typescript-action/actions/workflows/check-dist.yml/badge.svg)](https://github.com/actions/typescript-action/actions/workflows/check-dist.yml)
[![CodeQL](https://github.com/actions/typescript-action/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/actions/typescript-action/actions/workflows/codeql-analysis.yml)

Use AI models from [GitHub Models](https://github.com/marketplace/models) in
your workflows.

## Usage

Create a workflow to use the AI inference action:

```yaml
name: 'AI inference'
on: workflow_dispatch

jobs:
  inference:
    permissions:
      models: read
    runs-on: ubuntu-latest
    steps:
      - name: Test Local Action
        id: inference
        uses: actions/ai-inference@v1
        with:
          prompt: 'Hello!'

      - name: Print Output
        id: output
        run: echo "${{ steps.inference.outputs.response }}"
```

### Using a prompt file

You can also provide a prompt file instead of an inline prompt. The action
supports both plain text files and structured `.prompt.yml` files:

```yaml
steps:
  - name: Run AI Inference with Text File
    id: inference
    uses: actions/ai-inference@v1
    with:
      prompt-file: './path/to/prompt.txt'
```

### Using GitHub prompt.yml files

For more advanced use cases, you can use structured `.prompt.yml` files that
support templating, custom models, and JSON schema responses:

```yaml
steps:
  - name: Run AI Inference with Prompt YAML
    id: inference
    uses: actions/ai-inference@v1
    with:
      prompt-file: './.github/prompts/sample.prompt.yml'
      input: |
        var1: hello
        var2: ${{ steps.some-step.outputs.output }}
        var3: |
          Lorem Ipsum
          Hello World
      file_input: |
        var4: ./path/to/long-text.txt
        var5: ./path/to/config.json
```

#### Simple prompt.yml example

```yaml
messages:
  - role: system
    content: Be as concise as possible
  - role: user
    content: 'Compare {{a}} and {{b}}, please'
model: openai/gpt-4o
```

#### Prompt.yml with JSON schema support

```yaml
messages:
  - role: system
    content: You are a helpful assistant that describes animals using JSON format
  - role: user
    content: |-
      Describe a {{animal}}
      Use JSON format as specified in the response schema
model: openai/gpt-4o
responseFormat: json_schema
jsonSchema: |-
  {
    "name": "describe_animal",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "The name of the animal"
        },
        "habitat": {
          "type": "string",
          "description": "The habitat the animal lives in"
        }
      },
      "additionalProperties": false,
      "required": [
        "name",
        "habitat"
      ]
    }
  }
```

Variables in prompt.yml files are templated using `{{variable}}` format and are
supplied via the `input` parameter in YAML format. Additionally, you can
provide file-based variables via `file_input`, where each key maps to a file
path.

### Using a system prompt file

In addition to the regular prompt, you can provide a system prompt file instead
of an inline system prompt:

```yaml
steps:
  - name: Run AI Inference with System Prompt File
    id: inference
    uses: actions/ai-inference@v1
    with:
      prompt: 'Hello!'
      system-prompt-file: './path/to/system-prompt.txt'
```

### Read output from file instead of output

This can be useful when model response exceeds actions output limit

```yaml
steps:
  - name: Test Local Action
    id: inference
    uses: actions/ai-inference@v1
    with:
      prompt: 'Hello!'

  - name: Use Response File
    run: |
      echo "Response saved to: ${{ steps.inference.outputs.response-file }}"
      cat "${{ steps.inference.outputs.response-file }}"
```

### MCP Integration (Model Context Protocol)

This action supports integration with Model Context Protocol (MCP) servers, allowing the AI model to access external tools and services.

#### Configuring MCP Servers

MCP servers are configured using a `.github/.mcp.json` file in your repository. This file defines which MCP servers to connect to and how to authenticate with them.

**Basic Example (.github/.mcp.json):**

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/directory"]
    },
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

**Using Environment Variables:**

The configuration supports environment variable substitution using `${VAR_NAME}` or `$VAR_NAME` syntax. This is useful for keeping sensitive credentials out of your repository.

```json
{
  "mcpServers": {
    "github": {
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${GITHUB_TOKEN}"
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

**Workflow Example:**

```yaml
steps:
  - name: Checkout repository
    uses: actions/checkout@v4

  - name: AI Inference with MCP
    id: inference
    uses: actions/ai-inference@v1
    with:
      prompt: 'Analyze the repository and list any open issues'
      enable-mcp: true
    env:
      GITHUB_TOKEN: ${{ secrets.USER_PAT }}
      SENTRY_TOKEN: ${{ secrets.SENTRY_TOKEN }}
```

> [!NOTE]
> The GitHub MCP server requires a Personal Access Token (PAT) with appropriate permissions. The workflow's built-in `GITHUB_TOKEN` does not have sufficient permissions for MCP. You can either:
> - Pass your PAT as the `GITHUB_TOKEN` environment variable (as shown above), which will override the built-in token
> - Use a different variable name (e.g., `GITHUB_PAT`) in both your `.github/.mcp.json` configuration and workflow environment variables

#### MCP Server Types

**HTTP Servers** - Connect to remote MCP servers via HTTP:

```json
{
  "serverName": {
    "url": "https://api.example.com/mcp/",
    "headers": {
      "Authorization": "Bearer ${TOKEN}"
    }
  }
}
```

**Stdio Servers** - Run MCP servers as local processes:

```json
{
  "serverName": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
    "env": {
      "DEBUG": "1"
    }
  }
}
```

#### Custom Configuration Path

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

## Inputs

Various inputs are defined in [`action.yml`](action.yml) to let you configure
the action:

| Name                 | Description                                                                                                                                                   | Default                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `token`              | Token to use for inference. Typically the GITHUB_TOKEN secret                                                                                                 | `github.token`                       |
| `prompt`             | The prompt to send to the model                                                                                                                               | N/A                                  |
| `prompt-file`        | Path to a file containing the prompt (supports .txt and .prompt.yml formats). If both `prompt` and `prompt-file` are provided, `prompt-file` takes precedence | `""`                                 |
| `input`              | Template variables in YAML format for .prompt.yml files (e.g., `var1: value1` on separate lines)                                                              | `""`                                 |
| `file_input`         | Template variables in YAML where values are file paths. The file contents are read and used for templating                                                    | `""`                                 |
| `system-prompt`      | The system prompt to send to the model                                                                                                                        | `"You are a helpful assistant"`      |
| `system-prompt-file` | Path to a file containing the system prompt. If both `system-prompt` and `system-prompt-file` are provided, `system-prompt-file` takes precedence             | `""`                                 |
| `model`              | The model to use for inference. Must be available in the [GitHub Models](https://github.com/marketplace?type=models) catalog                                  | `openai/gpt-4o`                      |
| `endpoint`           | The endpoint to use for inference. If you're running this as part of an org, you should probably use the org-specific Models endpoint                         | `https://models.github.ai/inference` |
| `max-tokens`         | The max number of tokens to generate                                                                                                                          | 200                                  |
| `enable-mcp`         | Enable Model Context Protocol integration (requires .github/.mcp.json configuration file)                                                                     | `false`                              |
| `enable-github-mcp`  | Legacy: Enable Model Context Protocol integration (alias for enable-mcp)                                                                                      | `false`                              |
| `mcp-config-path`    | Path to MCP configuration file (defaults to .github/.mcp.json)                                                                                                | `""`                                 |

## Outputs

The AI inference action provides the following outputs:

| Name            | Description                                                             |
| --------------- | ----------------------------------------------------------------------- |
| `response`      | The response from the model                                             |
| `response-file` | The file path where the response is saved (useful for larger responses) |

## Required Permissions

In order to run inference with GitHub Models, the GitHub AI inference action
requires `models` permissions.

```yml
permissions:
  contents: read
  models: read
```

## Publishing a New Release

This project includes a helper script, [`script/release`](./script/release)
designed to streamline the process of tagging and pushing new releases for
GitHub Actions. For more information, see
[Versioning](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md)
in the GitHub Actions toolkit.

GitHub Actions allows users to select a specific version of the action to use,
based on release tags. This script simplifies this process by performing the
following steps:

1. **Retrieving the latest release tag:** The script starts by fetching the most
   recent SemVer release tag of the current branch, by looking at the local data
   available in your repository.
1. **Prompting for a new release tag:** The user is then prompted to enter a new
   release tag. To assist with this, the script displays the tag retrieved in
   the previous step, and validates the format of the inputted tag (vX.X.X). The
   user is also reminded to update the version field in package.json.
1. **Tagging the new release:** The script then tags a new release and syncs the
   separate major tag (e.g. v1, v2) with the new release tag (e.g. v1.0.0,
   v2.1.2). When the user is creating a new major release, the script
   auto-detects this and creates a `releases/v#` branch for the previous major
   version.
1. **Pushing changes to remote:** Finally, the script pushes the necessary
   commits, tags and branches to the remote repository. From here, you will need
   to create a new release in GitHub so users can easily reference the new tags
   in their workflows.

## License

This project is licensed under the terms of the MIT open source license. Please
refer to [MIT](./LICENSE.txt) for the full terms.

## Contributions

Contributions are welcome! See the [Contributor's Guide](CONTRIBUTING.md).
