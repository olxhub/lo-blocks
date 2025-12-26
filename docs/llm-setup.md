# LLM Configuration

This project supports multiple LLM providers. Configuration is via environment variables, typically set in `.env.local`.

## Provider Selection

Set `LLM_PROVIDER` explicitly, or let the system infer from other env vars:

```bash
LLM_PROVIDER=bedrock   # or: azure, openai, stub
```

If not set, the provider is inferred from which env vars are present. If conflicting signals are detected (e.g., both `AWS_BEDROCK_MODEL` and `OPENAI_DEPLOYMENT_ID`), the system exits with an error.

## AWS Bedrock (Claude)

Recommended for Claude models. Uses AWS credentials for authentication.

```bash
LLM_PROVIDER=bedrock
AWS_BEDROCK_MODEL=us.anthropic.claude-3-5-sonnet-20241022-v2:0
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```

### Model IDs

Use the cross-region inference profile format (with `us.` prefix). Without the prefix, most models return "inference profile required" errors.

| Model | ID |
|-------|-----|
| Claude 3.5 Sonnet v2 | `us.anthropic.claude-3-5-sonnet-20241022-v2:0` |
| Claude 3.5 Haiku | `us.anthropic.claude-3-5-haiku-20241022-v1:0` |
| Claude 3 Opus | `us.anthropic.claude-3-opus-20240229-v1:0` |
| Claude 3 Sonnet | `us.anthropic.claude-3-sonnet-20240229-v1:0` |
| Claude 3 Haiku | `us.anthropic.claude-3-haiku-20240307-v1:0` |

### AWS Credentials

Options for providing credentials:

1. **Environment variables** (shown above)
2. **AWS credentials file** (`~/.aws/credentials`)
3. **IAM role** (if running on AWS infrastructure)

The AWS SDK automatically checks these sources.

## OpenAI

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-nano          # optional, default: gpt-4.1-nano
OPENAI_BASE_URL=https://...        # optional, default: https://api.openai.com/v1/
```

### Model Selection

The model is controlled server-side only (client cannot override). Common models:

- `gpt-4.1-nano` - fast and cheap (default)
- `gpt-4o` - GPT-4 Omni
- `gpt-4o-mini` - smaller GPT-4 Omni

## Azure OpenAI

```bash
LLM_PROVIDER=azure
AZURE_API_KEY=...
AZURE_DEPLOYMENT_ID=my-gpt4-deployment
AZURE_BASE_URL=https://myresource.openai.azure.com/openai/
AZURE_API_VERSION=2024-02-15      # optional
```

The `AZURE_DEPLOYMENT_ID` is the name you gave when deploying a model in Azure Portal, not the model name itself.

Note: Azure uses `AZURE_*` prefix (not `OPENAI_*`) to avoid conflicts when inferring provider from env vars.

## OpenAI-Compatible Providers

Any provider with an OpenAI-compatible API works by setting `OPENAI_BASE_URL`:

```bash
# OpenRouter
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-or-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1/
OPENAI_MODEL=anthropic/claude-3-haiku

# Local Ollama (no API key needed)
LLM_PROVIDER=openai
OPENAI_BASE_URL=http://localhost:11434/v1/
OPENAI_MODEL=llama2
```

Note: For servers that don't require authentication (like local Ollama), you can omit `OPENAI_API_KEY`.

## Stub Mode (Development)

For development without API access:

```bash
LLM_PROVIDER=stub
```

Or simply don't set any provider credentials. The stub returns fake responses that echo the input, useful for testing the UI without incurring API costs.

## Troubleshooting

### "Conflicting LLM provider settings detected"

You have env vars for multiple providers. Either:
1. Set `LLM_PROVIDER` explicitly to choose one
2. Remove the conflicting env vars

### "inference profile required" error (Bedrock)

Add the `us.` prefix to the model ID:
```bash
# Wrong
AWS_BEDROCK_MODEL=anthropic.claude-3-5-sonnet-20241022-v2:0

# Correct
AWS_BEDROCK_MODEL=us.anthropic.claude-3-5-sonnet-20241022-v2:0
```

### 404 errors (Azure)

Ensure `AZURE_BASE_URL` includes `/openai/` at the end:
```bash
AZURE_BASE_URL=https://myresource.openai.azure.com/openai/
```

### URL concatenation errors

The base URL is automatically normalized to include a trailing slash, so both work:
```bash
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_BASE_URL=https://api.openai.com/v1/
```
