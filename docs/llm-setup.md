# LLM Configuration

This project supports multiple LLM providers. Configuration is via environment variables, typically set in `.env.local`.

## Provider Priority

The system detects which provider to use based on which env vars are set, in this order:

1. **Bedrock** - if `AWS_BEDROCK_MODEL` is set
2. **Azure OpenAI** - if `OPENAI_DEPLOYMENT_ID` is set
3. **OpenAI** - if `OPENAI_API_KEY` is set
4. **Stub** - fallback when no credentials, or `LLM_MODE=STUB`

## AWS Bedrock (Claude)

Recommended for Claude models. Uses AWS credentials for authentication.

```bash
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
OPENAI_API_KEY=...
OPENAI_DEPLOYMENT_ID=my-gpt4-deployment
OPENAI_BASE_URL=https://myresource.openai.azure.com/openai/
OPENAI_API_VERSION=2024-02-15      # optional
```

The `OPENAI_DEPLOYMENT_ID` is the name you gave when deploying a model in Azure Portal, not the model name itself.

## OpenAI-Compatible Providers

Any provider with an OpenAI-compatible API works by setting `OPENAI_BASE_URL`:

```bash
# OpenRouter
OPENAI_API_KEY=sk-or-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1/
OPENAI_MODEL=anthropic/claude-3-haiku

# Local Ollama
OPENAI_BASE_URL=http://localhost:11434/v1/
OPENAI_MODEL=llama2
```

## Stub Mode (Development)

For development without API access:

```bash
LLM_MODE=STUB
```

Or simply don't set any credentials. The stub returns fake responses that echo the input, useful for testing the UI without incurring API costs.

## Troubleshooting

### "inference profile required" error (Bedrock)

Add the `us.` prefix to the model ID:
```bash
# Wrong
AWS_BEDROCK_MODEL=anthropic.claude-3-5-sonnet-20241022-v2:0

# Correct
AWS_BEDROCK_MODEL=us.anthropic.claude-3-5-sonnet-20241022-v2:0
```

### 404 errors (Azure)

Ensure `OPENAI_BASE_URL` includes `/openai/` at the end:
```bash
OPENAI_BASE_URL=https://myresource.openai.azure.com/openai/
```

### URL concatenation errors

The base URL is automatically normalized to include a trailing slash, so both work:
```bash
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_BASE_URL=https://api.openai.com/v1/
```
