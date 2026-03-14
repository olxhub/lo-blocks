/** Module-level lazy singleton — unique actor ID per browser session. */
let _actorId: string | null = null;

export function getActorId(): string {
  if (!_actorId) {
    _actorId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `actor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  return _actorId;
}
