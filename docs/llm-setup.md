# LLM Configuration

LLM provider and model selection is managed through PMSS (the project's
CSS-like configuration system). Environment variables provide **credentials
only** — they do not select the provider or model.

## Architecture

```
Startup:
  1. Load system.pmss + server.pmss + local.pmss (if exists)
  2. Build classes: [server, env, credential-classes, PMSS_CLASSES]
  3. initConfig(combined, classes)
  4. Validate resolved provider has credentials

Request:
  1. resolveLLMConfig(profile, context) → { provider, model, maxTokens, rpm, tokenBudget }
  2. dispatchLLMProxy(body, provider, model)
```

LLM requests go to `POST /api/llm/chat/completions`. Both the Hono server
and the Next.js app serve this endpoint; provider dispatch logic is shared
via `packages/shared/lib/llm/proxy.ts`.

## How Provider Selection Works

At startup, the system detects which providers have valid credentials and
adds PMSS classes:

| Env vars set | PMSS class added |
|---|---|
| `AWS_BEDROCK_MODEL` | `llm_available_bedrock` |
| `OPENAI_API_KEY` or `OPENAI_BASE_URL` | `llm_available_openai` |
| `AZURE_DEPLOYMENT_ID` + `AZURE_BASE_URL` | `llm_available_azure` |

PMSS rules in `config/server.pmss` condition on these classes:

```pmss
/* Default: stub (no credentials) */
* { llm-provider: stub; }

/* Auto-select based on available credentials */
.llm_available_openai  { llm-provider: openai; }
.llm_available_azure   { llm-provider: azure; }
.llm_available_bedrock { llm-provider: bedrock; }
```

The last matching rule wins (standard CSS specificity). If you have
credentials for multiple providers, the one listed last in `server.pmss`
takes priority (bedrock > azure > openai by default).

## Credentials

### AWS Bedrock

```bash
AWS_BEDROCK_MODEL=us.anthropic.claude-sonnet-4-20250514-v1:0
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1  # optional, default: us-east-1
```

Use the cross-region inference profile format (`us.` or `eu.` prefix).
The AWS SDK also accepts `~/.aws/credentials` or IAM roles.

Currently the Bedrock code path builds Anthropic-format request bodies —
non-Anthropic models on Bedrock are not yet supported (see
`TODO(bedrock-multi-model)` in `proxy.ts`).

### OpenAI (and compatible)

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-nano          # optional, used when PMSS llm-model is empty
OPENAI_BASE_URL=https://...        # optional, default: https://api.openai.com/v1/
```

Works with any OpenAI-compatible API (Ollama, OpenRouter, etc.) by setting
`OPENAI_BASE_URL`. For local servers that don't require auth, omit
`OPENAI_API_KEY`.

### Azure OpenAI

```bash
AZURE_API_KEY=...
AZURE_DEPLOYMENT_ID=my-gpt4-deployment
AZURE_BASE_URL=https://myresource.openai.azure.com/openai/
AZURE_API_VERSION=2024-02-15  # optional
```

`AZURE_DEPLOYMENT_ID` is the deployment name from Azure Portal, not the
model name. Azure uses the deployment ID for routing, not a model string.

## Local Overrides (`config/local.pmss`)

For deploy-specific settings, create `config/local.pmss` (gitignored).
See `config/local.pmss.example` for a template.

```pmss
/* Force a specific model */
.server { llm-model: us.anthropic.claude-sonnet-4-20250514-v1:0; }

/* Override provider selection */
.server { llm-provider: openai; }

/* Force stub mode */
.server { llm-provider: stub; }
```

## `PMSS_CLASSES` Environment Variable

Add extra PMSS classes at startup via the `PMSS_CLASSES` env var
(comma-separated):

```bash
PMSS_CLASSES=llm_available_openai,custom_class
```

This is useful for CI/CD or Docker where you want to inject classes without
modifying PMSS files.

## Model Resolution

The model is resolved in this order:

1. **PMSS `llm-model`** property (from server.pmss or local.pmss)
2. **Env var fallback** (`AWS_BEDROCK_MODEL` for bedrock, `OPENAI_MODEL` for openai)
3. Empty string (provider uses its own default, or stub mode)

## Profiles

Clients send a `profile` field (e.g., `'interactive'`, `'translation'`)
instead of raw `max_completion_tokens`. The server resolves the profile to
concrete parameters via PMSS attribute selectors:

```pmss
.server[profile="interactive"] { llm-max-tokens: 4096; }
.server[profile="translation"] { llm-max-tokens: 16384; }
```

If neither `profile` nor `max_completion_tokens` is provided, defaults to
`'interactive'`.

## Rate Limiting

The Hono server enforces per-user rate limits on `/api/llm/chat/completions`:

- **Requests per minute (RPM)** — sliding window counter
- **Token budget** — running total of LLM tokens consumed

Limits are configured via PMSS and vary by auth status:

```pmss
* { llm-rpm: 20; llm-token-budget: 100000; }
.server.guest { llm-rpm: 5; llm-token-budget: 10000; }
```

When a limit is exceeded, the endpoint returns HTTP 429.

## PMSS Properties

| Property | Default | Description |
|---|---|---|
| `llm-provider` | `stub` | Provider: `bedrock`, `openai`, `azure`, `stub` |
| `llm-model` | `""` | Model ID (falls back to env var if empty) |
| `llm-max-tokens` | `4096` | Max output tokens per request |
| `llm-rpm` | `20` | Requests per minute per user |
| `llm-token-budget` | `100000` | Total LLM tokens per user |

## Stub Mode

If no provider credentials are configured, the system runs in stub mode
automatically. Stub returns fake responses that echo the input — useful for
testing the UI without API costs.

## Troubleshooting

### "inference profile required" error (Bedrock)

Add the `us.` prefix to the model ID:
```bash
AWS_BEDROCK_MODEL=us.anthropic.claude-sonnet-4-20250514-v1:0
```

### 404 errors (Azure)

Ensure `AZURE_BASE_URL` includes `/openai/` at the end:
```bash
AZURE_BASE_URL=https://myresource.openai.azure.com/openai/
```

### Wrong provider selected

Check which credential classes are active by looking at startup logs.
Override in `config/local.pmss`:
```pmss
.server { llm-provider: openai; }
```

### "Rate limit exceeded" / "LLM token budget exhausted"

Per-user limits configured in `server.pmss`. Guest users have tighter
defaults. Check `llm-rpm` and `llm-token-budget` properties.
