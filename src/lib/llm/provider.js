// src/lib/llm/provider.js
//
// LLM provider detection and configuration.
// Shared between instrumentation (startup validation) and route handler.

// --- Config ---

// Bedrock
export const AWS_BEDROCK_MODEL = process.env.AWS_BEDROCK_MODEL;
export const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Azure (separate namespace to avoid conflicts)
export const AZURE_API_KEY = process.env.AZURE_API_KEY;
export const AZURE_DEPLOYMENT_ID = process.env.AZURE_DEPLOYMENT_ID;
export const AZURE_API_VERSION = process.env.AZURE_API_VERSION || '2024-02-15';
const rawAzureUrl = process.env.AZURE_BASE_URL;
export const AZURE_BASE_URL = rawAzureUrl
  ? (rawAzureUrl.endsWith('/') ? rawAzureUrl : rawAzureUrl + '/')
  : null;

// OpenAI (and compatible)
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-nano';
const rawOpenaiUrl = process.env.OPENAI_BASE_URL;
export const OPENAI_BASE_URL = rawOpenaiUrl
  ? (rawOpenaiUrl.endsWith('/') ? rawOpenaiUrl : rawOpenaiUrl + '/')
  : 'https://api.openai.com/v1/';

// --- Provider Detection ---

export function detectProvider() {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit) {
    if (!['bedrock', 'azure', 'openai', 'stub'].includes(explicit)) {
      throw new Error(`Invalid LLM_PROVIDER: ${explicit}. Must be bedrock, azure, openai, or stub.`);
    }
    return explicit;
  }

  // Infer from env vars
  const signals = {
    bedrock: !!AWS_BEDROCK_MODEL,
    azure: !!(AZURE_DEPLOYMENT_ID && AZURE_BASE_URL),  // Both required
    openai: !!(OPENAI_API_KEY || rawOpenaiUrl),
  };

  const detected = Object.entries(signals).filter(([, v]) => v).map(([k]) => k);

  if (detected.length > 1) {
    throw new Error(
      `Conflicting LLM provider settings detected: ${detected.join(', ')}. ` +
      `Set LLM_PROVIDER explicitly or remove conflicting env vars.`
    );
  }

  return detected[0] || 'stub';
}

// --- Cached provider (detected once) ---

let _provider = null;
let _error = null;

export function getProvider() {
  if (_provider === null && _error === null) {
    try {
      _provider = detectProvider();
    } catch (e) {
      _error = e.message;
    }
  }
  return { provider: _provider, error: _error };
}

// --- Startup validation (called from instrumentation.ts) ---

function validateAzureConfig() {
  const issues = [];

  if (!AZURE_BASE_URL) {
    issues.push('AZURE_BASE_URL is required');
  } else {
    try {
      new URL(AZURE_BASE_URL);
    } catch {
      issues.push(`AZURE_BASE_URL is not a valid URL: ${AZURE_BASE_URL}`);
    }
  }

  if (!AZURE_DEPLOYMENT_ID) {
    issues.push('AZURE_DEPLOYMENT_ID is required');
  }

  if (!AZURE_API_KEY) {
    issues.push('AZURE_API_KEY is required');
  }

  // Show the constructed URL so users can verify it's correct
  if (AZURE_BASE_URL && AZURE_DEPLOYMENT_ID) {
    const constructedUrl = `${AZURE_BASE_URL}deployments/${AZURE_DEPLOYMENT_ID}/chat/completions?api-version=${AZURE_API_VERSION}`;
    console.log(`\n📋 Azure URL that will be used:\n   ${constructedUrl}`);
    console.log(`\n   Expected format: https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=...`);
    console.log(`\n   If this looks wrong, adjust AZURE_BASE_URL. It should end with /openai/`);
    console.log(`   Example: AZURE_BASE_URL=https://myresource.openai.azure.com/openai/\n`);
  }

  return issues;
}

function validateBedrockConfig() {
  const issues = [];

  if (!AWS_BEDROCK_MODEL) {
    issues.push('AWS_BEDROCK_MODEL is required');
  } else if (!AWS_BEDROCK_MODEL.startsWith('us.') && !AWS_BEDROCK_MODEL.startsWith('eu.')) {
    issues.push(`AWS_BEDROCK_MODEL should use cross-region format (us. or eu. prefix) - got: ${AWS_BEDROCK_MODEL}`);
  }

  return issues;
}

function validateOpenAIConfig() {
  const issues = [];

  if (OPENAI_BASE_URL && OPENAI_BASE_URL !== 'https://api.openai.com/v1/') {
    try {
      new URL(OPENAI_BASE_URL);
    } catch {
      issues.push(`OPENAI_BASE_URL is not a valid URL: ${OPENAI_BASE_URL}`);
    }
    // No API key warning for custom endpoints (e.g., Ollama)
  } else if (!OPENAI_API_KEY) {
    issues.push('OPENAI_API_KEY is required for api.openai.com');
  }

  return issues;
}

export function validateProviderOrExit() {
  const { provider, error } = getProvider();

  if (error) {
    console.error(`\n❌ LLM configuration error: ${error}\n`);
    console.error(`See docs/llm-setup.md for configuration options.\n`);
    process.exit(1);
  }

  // Provider-specific validation
  let issues = [];
  switch (provider) {
    case 'azure':
      issues = validateAzureConfig();
      break;
    case 'bedrock':
      issues = validateBedrockConfig();
      break;
    case 'openai':
      issues = validateOpenAIConfig();
      break;
  }

  if (issues.length > 0) {
    console.error(`\n❌ LLM configuration issues (provider: ${provider}):\n`);
    issues.forEach(issue => console.error(`   • ${issue}`));
    console.error(`\nSee docs/llm-setup.md for configuration options.\n`);
    process.exit(1);
  }

  if (provider === 'stub') {
    console.log(`
⚠️  LLM running in STUB mode - responses are fake.

To configure a real LLM provider, set LLM_PROVIDER and required env vars:

  Bedrock (Claude):
    LLM_PROVIDER=bedrock
    AWS_BEDROCK_MODEL=us.anthropic.claude-3-5-sonnet-20241022-v2:0
    AWS_ACCESS_KEY_ID=...
    AWS_SECRET_ACCESS_KEY=...
    AWS_REGION=us-east-1

  Azure OpenAI:
    LLM_PROVIDER=azure
    AZURE_API_KEY=...
    AZURE_DEPLOYMENT_ID=my-deployment
    AZURE_BASE_URL=https://myresource.openai.azure.com/openai/

  OpenAI (or compatible, e.g., Ollama):
    LLM_PROVIDER=openai
    OPENAI_API_KEY=sk-...              # optional for local servers
    OPENAI_BASE_URL=http://localhost:11434/v1/  # optional

See docs/llm-setup.md for details.
`);
  } else {
    console.log(`✓ LLM provider: ${provider}`);
  }

  return provider;
}
