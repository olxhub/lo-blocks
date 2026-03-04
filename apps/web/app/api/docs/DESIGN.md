# API Documentation Routes - Design Notes

## Current Structure

```
/api/docs/              - List all blocks
/api/docs/block/[name]  - Block metadata, readme, examples (future)
/api/docs/grammar/[name] - Grammar metadata, preview template
```

## Design Decision: Type-Prefixed Routes

We chose `/api/docs/[type]/[name]` over a single `/api/docs/[name]` endpoint.

**Reasons:**
- Avoids naming collisions (e.g., "Chat" block vs "chat" grammar)
- Allows type-specific response structures
- Extensible to other resource types (templates, themes, etc.)
- Clear REST-like semantics

## Alternatives Considered

### 1. Single route with disambiguation
`/api/docs/[name]?type=grammar`

Rejected: Query params feel wrong for resource identity.

### 2. POST with search parameters
`POST /api/docs { type: "grammar", name: "chat", namespace: "mit.edu" }`

Rejected: Harder to debug (can't inspect in browser), less REST-like.
May revisit for complex queries.

### 3. Direct file serving
`/api/src?path=components/blocks/Chat/...`

Rejected: Breaks abstraction if we move to database/git/archive storage.
The provenance system exists to handle multiple sources.

### 4. Namespace-based organization
`/api/docs/[namespace]/[type]/[name]`
e.g., `/api/docs/mit.edu/grammar/chat`

Not implemented yet, but may be needed when we support external block
archives or organizational hierarchies.

## Future Considerations

- **Database-backed resources**: Current file-based approach should be
  abstracted behind the same API
- **Block/grammar archives**: External sources with their own namespaces
- **Dynamic loading**: Blocks not in core could come from elsewhere
- **Richer metadata**: Descriptions, examples, versioning, dependencies

## Open Questions

- Should blocks and grammars share a registry abstraction?
- How do namespaces interact with the type hierarchy?
- Should we support batch queries (multiple resources at once)?

This structure may be re-evaluated as requirements evolve.
