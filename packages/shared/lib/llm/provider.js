// packages/shared/lib/llm/provider.js
//
// LLM provider credentials and availability detection.
//
// This module does NOT select the active provider — that's PMSS's job
// (see profiles.ts). It provides:
//   - Env var constants for API calls
//   - Credential detection (which providers have valid credentials?)
//   - PMSS class names for credential availability
//   - Model fallback from env vars when PMSS llm-model is empty
//   - Config validation (returns issues, doesn't exit)

// --- Env var constants (used by proxy.ts for API calls) ---

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

// --- Credential detection ---

/**
 * Detect which PMSS classes should be added based on available credentials.
 *
 * Returns class names like 'llm_available_bedrock' that PMSS rules can
 * condition on (e.g. `.llm_available_openai { llm-provider: openai; }`).
 *
 * @returns {string[]} PMSS class names for providers with credentials
 */
export function detectCredentialClasses() {
  const classes = [];

  if (AWS_BEDROCK_MODEL) {
    classes.push('llm_available_bedrock');
  }
  if (AZURE_DEPLOYMENT_ID && AZURE_BASE_URL) {
    classes.push('llm_available_azure');
  }
  if (OPENAI_API_KEY || rawOpenaiUrl) {
    classes.push('llm_available_openai');
  }

  return classes;
}

/**
 * List providers that have valid credentials.
 * Always includes 'stub' as a fallback.
 *
 * @returns {string[]}
 */
export function availableProviders() {
  const providers = ['stub'];

  if (AWS_BEDROCK_MODEL) providers.push('bedrock');
  if (AZURE_DEPLOYMENT_ID && AZURE_BASE_URL) providers.push('azure');
  if (OPENAI_API_KEY || rawOpenaiUrl) providers.push('openai');

  return providers;
}

/**
 * Fall back to env var for model when PMSS llm-model is empty.
 *
 * @param {string} provider
 * @returns {string} Model ID from env var, or empty string
 */
export function envModelFallback(provider) {
  switch (provider) {
    case 'bedrock': return AWS_BEDROCK_MODEL || '';
    case 'openai': return OPENAI_MODEL || '';
    // Azure uses deployment ID, not a model string
    default: return '';
  }
}

// --- Validation ---

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
    console.log(`\n  Azure URL that will be used:\n   ${constructedUrl}`);
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

/**
 * Validate that a provider's credentials are properly configured.
 *
 * @param {string} provider - Provider name to validate
 * @returns {{ ok: boolean, issues: string[] }}
 */
export function validateProviderConfig(provider) {
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
    case 'stub':
      break;
    default:
      issues = [`Unknown provider: ${provider}`];
  }
  return { ok: issues.length === 0, issues };
}
