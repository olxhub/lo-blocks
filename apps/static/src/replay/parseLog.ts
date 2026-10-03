// apps/static/src/replay/parseLog.ts
//
// Browser-safe parsing of production event logs for the replay viewer.
//
// Production logs are NDJSON (.jsonl), optionally gzipped (.jsonl.gz), one file
// per browser connection. The first line is an `ndjson_header` carrying
// { started, user: { user_id, safe_user_id } }. Subsequent lines are events.
//
// This module is deliberately free of Node APIs (no zlib/fs). Gzip is handled
// via the browser's DecompressionStream so the viewer works in a pure static
// build with no server.
//
import type { LoggedEvent } from '@/lib/replay';

export interface LogHeader {
  description?: string;
  started?: string;
  user?: {
    user_id?: string;
    safe_user_id?: string;
    provenance?: string;
    authorized?: boolean;
  };
}

export interface ParsedLog {
  header: LogHeader | null;
  /** All events except the header (still includes save_blob). */
  events: LoggedEvent[];
  /** Events suitable for replay: save_blob filtered out (see notes below). */
  replayEvents: LoggedEvent[];
  /** True if the log contains a fetch_blob_response (server-supplied state). */
  hasFetchBlobResponse: boolean;
  /** Source filename, for display / ordering. */
  fileName: string;
}

/**
 * Decompress a gzip ArrayBuffer to text using the browser DecompressionStream.
 * Available in all evergreen browsers.
 */
export async function gunzipToText(buffer: ArrayBuffer): Promise<string> {
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([buffer]).stream().pipeThrough(ds);
  return await new Response(stream).text();
}

/**
 * Parse NDJSON text into a ParsedLog.
 *
 * Notes on the reducer quirks this handles:
 *  - The first `ndjson_header` line is metadata, not an event.
 *  - `save_blob` events have no `id`; the shared reducer would fold them into a
 *    junk `component["undefined"]` entry. We keep them in `events` (for the
 *    header/count display) but strip them from `replayEvents`. (A separate fix
 *    will address the reducer itself; we do NOT touch it here.)
 */
export function parseNDJSON(content: string, fileName: string): ParsedLog {
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  let header: LogHeader | null = null;
  const events: LoggedEvent[] = [];

  for (const line of lines) {
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // skip malformed lines rather than failing the whole load
    }
    if (parsed.event === 'ndjson_header') {
      header = parsed;
    } else {
      events.push(parsed);
    }
  }

  const replayEvents = events.filter(e => e.event !== 'save_blob');
  const hasFetchBlobResponse = events.some(e => e.event === 'fetch_blob_response');

  return { header, events, replayEvents, hasFetchBlobResponse, fileName };
}
