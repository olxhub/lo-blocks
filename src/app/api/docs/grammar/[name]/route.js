// src/app/api/docs/grammar/[name]/route.js
//
// Grammar documentation API - serves metadata and content for PEG grammars.
//
// DESIGN NOTE (December 2024):
// This route follows the pattern /api/docs/[resource-type]/[name] to serve
// documented resources. We chose type-prefixed routes over a single /api/docs/[name]
// to avoid naming collisions (e.g., "Chat" block vs "chat" grammar) and to allow
// type-specific response structures.
//
// ALTERNATIVES CONSIDERED:
// 1. Single route with disambiguation - /api/docs/[name]?type=grammar
//    Rejected: query params feel wrong for resource identity
//
// 2. POST with search parameters - POST /api/docs { type: "grammar", name: "chat" }
//    Rejected: harder to debug (can't inspect in browser), less REST-like
//
// 3. Namespace-based organization - /api/docs/[namespace]/[type]/[name]
//    e.g., /api/docs/mit.edu/grammar/chat
//    Not implemented yet, but may be needed when we support external block archives
//
// 4. Direct file serving - /api/src?path=...
//    Rejected: breaks abstraction if we move to database/git/archive storage.
//    The provenance system exists to handle multiple sources.
//
// This structure may be re-evaluated as we add support for:
// - External block/grammar archives
// - Database-backed resources
// - Namespace/organization hierarchies
//
import { promises as fs } from 'fs';
import { resolveSafeReadPath } from '@/lib/storage/providers/file';
import { grammarInfo, PEG_CONTENT_EXTENSIONS } from '@/generated/parserRegistry';

export async function GET(request, { params }) {
  const { name } = await params;

  // Find grammar by name or extension
  // Accept both "chat" and "chatpeg"
  const ext = name.endsWith('peg') ? name : `${name}peg`;
  const info = grammarInfo[ext];

  if (!info) {
    return Response.json(
      { ok: false, error: `Grammar '${name}' not found` },
      { status: 404 }
    );
  }

  const result = {
    name: info.grammarName,
    extension: ext,
    grammarDir: info.grammarDir,
    preview: null,
    // Future: description, readme, examples
  };

  // Load preview template if it exists
  const previewFileName = `${info.grammarName}.pegjs.preview.olx`;
  const grammarDirPath = info.grammarDir.replace(/^@\//, 'src/');
  const previewPath = `${grammarDirPath}/${previewFileName}`;

  try {
    const fullPath = await resolveSafeReadPath(process.cwd(), previewPath);
    result.preview = await fs.readFile(fullPath, 'utf-8');
  } catch (err) {
    // Preview is optional - not an error if missing
    if (err.code !== 'ENOENT' && !err.message?.includes('not found')) {
      console.warn(`[API /docs/grammar] Could not read preview for ${name}: ${err.message}`);
    }
  }

  return Response.json({ ok: true, grammar: result });
}
