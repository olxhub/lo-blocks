# LLM Configuration

**Status: Prototype.** This system is largely untested beyond basic
manual verification. The PMSS-based provider selection, credential
fallback logic, and multi-entry-point initialization have not been
exercised in production. Expect rough edges.

## Quick Start

Set credentials for your provider. The system auto-detects which
provider to use based on which env vars are present.

**AWS Bedrock:**
```bash
AWS_BEDROCK_MODEL=us.anthropic.claude-sonnet-4-20250514-v1:0
AWS_REGION=us-east-1
# Plus AWS credentials (env vars, ~/.aws/credentials, or IAM role)
```

**OpenAI (or compatible):**
```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-nano          # optional, default: gpt-4.1-nano
OPENAI_BASE_URL=https://...        # optional, default: https://api.openai.com/v1/
```

**Azure OpenAI:**
```bash
AZURE_API_KEY=...
AZURE_DEPLOYMENT_ID=my-gpt4-deployment
AZURE_BASE_URL=https://myresource.openai.azure.com/openai/
AZURE_API_VERSION=2024-02-15       # optional
```

**No credentials = stub mode.** Fake responses that echo the input.

That's it for basic use. The rest of this document covers the PMSS
configuration system for fine-grained control.

---

## How It Works

Environment variables provide **credentials**. PMSS selects the
**provider, model, and limits**.

At startup:

1. The system reads `config/system.pmss` + `config/server.pmss` +
   `config/local.pmss` (if it exists).
2. It detects which providers have credentials and adds PMSS classes:

   | Env vars present | PMSS class added |
   |---|---|
   | `AWS_BEDROCK_MODEL` | `llm_available_bedrock` |
   | `OPENAI_API_KEY` or `OPENAI_BASE_URL` | `llm_available_openai` |
   | `AZURE_DEPLOYMENT_ID` + `AZURE_BASE_URL` | `llm_available_azure` |

3. PMSS rules in `server.pmss` match these classes to select a provider:

   ```pmss
   * { llm-provider: stub; }
   .llm_available_openai  { llm-provider: openai; }
   .llm_available_azure   { llm-provider: azure; }
   .llm_available_bedrock { llm-provider: bedrock; }
   ```

4. On each request, `resolveLLMConfig(profile, options)` resolves
   the full config: `{ provider, model, maxTokens, rpm, tokenBudget }`.

If credentials exist for multiple providers, the last matching PMSS
rule wins (bedrock > azure > openai in the default `server.pmss`).

### Model resolution

1. PMSS `llm-model` property (if non-empty)
2. Env var fallback: `AWS_BEDROCK_MODEL` for bedrock, `OPENAI_MODEL`
   for openai (Azure uses deployment ID, not a model string)
3. Empty string (stub, or provider default)

## PMSS Reference

### Properties

| Property | Default | Description |
|---|---|---|
| `llm-provider` | `stub` | `bedrock`, `openai`, `azure`, or `stub` |
| `llm-model` | `""` | Model ID. Falls back to env var if empty. |
| `llm-max-tokens` | `4096` | Max output tokens per request |
| `llm-rpm` | `20` | Requests per minute (per user) |
| `llm-token-budget` | `100000` | Total token budget (per user) |

### Classes

Classes are assembled at startup from several sources:

| Class | Source | Purpose |
|---|---|---|
| `server` | Always present | Server-side context |
| `development` / `production` | `NODE_ENV` | Deployment environment |
| `llm_available_bedrock` | Credential detection | Bedrock credentials present |
| `llm_available_openai` | Credential detection | OpenAI credentials present |
| `llm_available_azure` | Credential detection | Azure credentials present |
| `authorized` / `guest` | Per-request (auth status) | User authentication tier |
| *(custom)* | `PMSS_CLASSES` env var | Anything, comma-separated |

### Attributes

| Attribute | Set by | Values |
|---|---|---|
| `profile` | Request caller | `interactive`, `translation`, etc. |

### Selectors in practice

```pmss
/* All requests get stub by default */
* { llm-provider: stub; }

/* Credential auto-selection */
.llm_available_bedrock { llm-provider: bedrock; }

/* Tighter limits for guests */
.server.guest { llm-rpm: 5; llm-token-budget: 10000; }

/* Profile-specific token limits */
.server[profile="translation"] { llm-max-tokens: 16384; }

/* Deploy-specific override (in local.pmss) */
.server { llm-model: us.anthropic.claude-sonnet-4-20250514-v1:0; }
```

Standard PMSS/CSS specificity applies. A `.server.guest` selector is
more specific than `.llm_available_bedrock`, etc.

## Local Overrides

Create `config/local.pmss` (gitignored) for deploy-specific settings.
See `config/local.pmss.example` for a template.

```pmss
/* Force a specific model */
.server { llm-model: us.anthropic.claude-sonnet-4-20250514-v1:0; }

/* Override provider (ignoring credential auto-detection) */
.server { llm-provider: openai; }

/* Force stub mode */
.server { llm-provider: stub; }
```

## `PMSS_CLASSES` Environment Variable

Inject extra classes at startup without editing PMSS files:

```bash
PMSS_CLASSES=llm_available_openai,custom_class
```

Useful for CI/CD or Docker.

## Credential Details

### AWS Bedrock

```bash
AWS_BEDROCK_MODEL=us.anthropic.claude-sonnet-4-20250514-v1:0
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1  # optional, default: us-east-1
```

Use the cross-region inference profile format (`us.` or `eu.` prefix).
The AWS SDK also resolves credentials from `~/.aws/credentials` and
IAM roles.

Only Anthropic models on Bedrock are currently supported (see
`TODO(bedrock-multi-model)` in `proxy.ts`).

### OpenAI (and compatible)

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-nano
OPENAI_BASE_URL=https://api.openai.com/v1/
```

Works with any OpenAI-compatible API (Ollama, OpenRouter, etc.) by
setting `OPENAI_BASE_URL`. For local servers without auth (e.g.
Ollama), omit `OPENAI_API_KEY`.

### Azure OpenAI

```bash
AZURE_API_KEY=...
AZURE_DEPLOYMENT_ID=my-gpt4-deployment
AZURE_BASE_URL=https://myresource.openai.azure.com/openai/
AZURE_API_VERSION=2024-02-15
```

`AZURE_DEPLOYMENT_ID` is the deployment name from Azure Portal, not
the model name.

## Profiles

Clients send `{ profile: 'interactive' }` instead of raw
`max_completion_tokens`. The server resolves the profile via PMSS
attribute selectors. If no profile is specified, defaults to
`interactive`.

Currently defined profiles (in `server.pmss`):

| Profile | `llm-max-tokens` |
|---|---|
| `interactive` | 4096 |
| `translation` | 16384 |

## Rate Limiting

The Hono server enforces per-user rate limits on
`/api/llm/chat/completions`:

- **RPM** (`llm-rpm`) — requests per minute, sliding window
- **Token budget** (`llm-token-budget`) — cumulative tokens consumed

Returns HTTP 429 when exceeded. Limits vary by auth status:

```pmss
* { llm-rpm: 20; llm-token-budget: 100000; }
.server.guest { llm-rpm: 5; llm-token-budget: 10000; }
```

The Next.js route does not currently have rate limiting.

## Troubleshooting

**"inference profile required" (Bedrock):** Add `us.` prefix:
`AWS_BEDROCK_MODEL=us.anthropic.claude-sonnet-4-20250514-v1:0`

**404 errors (Azure):** `AZURE_BASE_URL` must end with `/openai/`:
`AZURE_BASE_URL=https://myresource.openai.azure.com/openai/`

**Wrong provider selected:** Check startup logs for active classes.
Override in `config/local.pmss`:
`.server { llm-provider: openai; }`

**Rate limit / token budget errors:** Check `llm-rpm` and
`llm-token-budget` in `server.pmss`. Guest users have tighter defaults.

## Entry Points

Three server contexts initialize PMSS independently (all via
`loadServerConfig` in `config.ts`):

| Context | Init location |
|---|---|
| Hono server | `apps/server/src/index.ts` |
| Next.js app | `apps/web/instrumentation.ts` |
| Translate CLI | `packages/shared/scripts/translate.ts` |

## Key Source Files

| File | Role |
|---|---|
| `packages/shared/lib/llm/provider.js` | Credential detection, env var exports, validation |
| `packages/shared/lib/llm/profiles.ts` | PMSS resolution (`resolveLLMConfig`, `resolveLLMConfigWithFallback`) |
| `packages/shared/lib/llm/proxy.ts` | Provider dispatch (`dispatchLLMProxy`) |
| `packages/shared/lib/llm/serverCall.ts` | Simple server-side LLM call (`callLLM`) |
| `packages/shared/lib/config.ts` | PMSS init and resolution (`loadServerConfig`, `getConfig`) |
| `config/server.pmss` | Default LLM rules |
| `config/local.pmss` | Deploy overrides (gitignored) |
