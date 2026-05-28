# LLM Configuration

This project supports multiple LLM providers. Configuration is via environment variables (typically in `.env.local`) and PMSS properties (in `config/system.pmss`).

## Architecture

LLM requests go to `POST /api/llm/chat/completions`. The path follows
OpenAI's URL scheme for library compatibility. Both the Hono server and
the Next.js app serve this endpoint; provider dispatch logic is shared
via `packages/shared/lib/llm/proxy.ts`.

## Provider Selection

Set `LLM_PROVIDER` explicitly, or let the system infer from other env vars:

```bash
LLM_PROVIDER=bedrock   # or: azure, openai, stub
```

If not set, the provider is inferred from which env vars are present. If conflicting signals are detected (e.g., both `AWS_BEDROCK_MODEL` and `OPENAI_DEPLOYMENT_ID`), the system exits with an error.

### Precedence: env vars vs PMSS

Environment variables and PMSS both configure the LLM provider, but they
serve different roles:

- **Environment variables** (`LLM_PROVIDER`, `AWS_BEDROCK_MODEL`, etc.) are the
  deployment-level override. If set, they always win. This keeps existing
  deployments working — set the env vars and PMSS is irrelevant.
- **PMSS** (`llm-provider`, `llm-model`, `llm-max-tokens`, etc.) provides
  defaults and per-profile/per-course overrides. PMSS values are only used
  when the corresponding env var is absent.

In practice: env vars select which provider and model are available on this
server; PMSS selects per-profile parameters (token limits, rate limits) and
can route different profiles to different models when the deployment supports it.

## AWS Bedrock

Uses AWS credentials for authentication. Currently the Bedrock code path builds Anthropic-format request bodies — non-Anthropic models on Bedrock (e.g., `openai.gpt-oss-*`) are not yet supported (see `TODO(bedrock-multi-model)` in `proxy.ts`).

```bash
LLM_PROVIDER=bedrock
AWS_BEDROCK_MODEL=us.anthropic.claude-sonnet-4-20250514-v1:0
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```

### Model IDs

Use the cross-region inference profile format (with `us.` prefix). Without the prefix, most models return "inference profile required" errors.

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

The model is controlled server-side only (client cannot override).

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

## Profiles

Clients send a `profile` field (e.g., `'interactive'`, `'translation'`) instead of raw `max_completion_tokens`. The server resolves the profile to concrete parameters. If neither `profile` nor `max_completion_tokens` is provided, defaults to `'interactive'`.

Profiles are configured via PMSS properties in `config/system.pmss`:

```pmss
.server[profile="interactive"] {
    llm-max-tokens: 4096;
}

.server[profile="translation"] {
    llm-max-tokens: 16384;
}
```

Course manifests can override profiles by adding PMSS classes.

## Rate Limiting

The Hono server enforces per-user rate limits on `/api/llm/chat/completions` (the Next.js route does not yet have rate limiting):

- **Requests per minute (RPM)** — sliding window counter, checked before the LLM call
- **Token budget** — running total of LLM tokens consumed, checked before the call and incremented after

Both limits are configured via PMSS and vary by auth status:

```pmss
/* Defaults for authenticated users */
* {
    llm-rpm: 20;
    llm-token-budget: 100000;
}

/* Tighter limits for unauthenticated (guest) users */
.server.guest {
    llm-rpm: 5;
    llm-token-budget: 10000;
}
```

When a limit is exceeded, the endpoint returns HTTP 429.

## PMSS Properties

All `llm-*` properties and their defaults:

| Property | Default | Description |
|----------|---------|-------------|
| `llm-provider` | `stub` | Provider name: `bedrock`, `openai`, `azure`, `stub` |
| `llm-model` | `""` | Model ID (overridden by env vars if set) |
| `llm-max-tokens` | `4096` | Max output tokens per request |
| `llm-rpm` | `20` | Requests per minute per user |
| `llm-token-budget` | `100000` | Total LLM tokens per user |

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

### "Rate limit exceeded" / "LLM token budget exhausted"

The per-user rate limit or token budget has been exceeded. Limits are configured in `system.pmss` and can differ by profile and auth status. Guest users have tighter defaults.
