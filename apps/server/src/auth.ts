// Auth identity resolution — re-exports from the shared module.
// See packages/shared/lib/util/auth.ts for implementation and docs.

export { type AuthUser, encodeId, parseBasicAuth, resolveUser } from '@/lib/util/auth';
