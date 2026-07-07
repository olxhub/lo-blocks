// packages/shared/components/blocks/media/vtt.ts
//
// Minimal WebVTT parsing for the standalone Transcript block. The player
// path uses the browser's native <track> machinery; a Transcript with no
// video element of its own needs to read the cue list directly. Handles
// the subset real course transcripts use: header, timed cues, multi-line
// text. Ignores NOTE/STYLE blocks, cue ids, and cue settings.

export interface VttCue { start: number; end: number; text: string }

const TIME = /(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/;

function parseTime(raw: string): number | null {
  const m = raw.match(TIME);
  if (!m) return null;
  const [, h, mm, ss, ms] = m;
  return (Number(h ?? 0) * 3600) + (Number(mm) * 60) + Number(ss) + Number(ms) / 1000;
}

// ─── Cue cache ───────────────────────────────────────────────────────────────
// Transcripts are static assets: fetch + parse once per URL, share across
// every Transcript instance and remount. Same hand-rolled lazy pattern as
// componentLoader (module cache + a useState render trigger) — the
// useState here is the loader's internal plumbing, not block state.

import { useEffect, useState } from 'react';

const cueCache = new Map<string, VttCue[] | Promise<VttCue[]>>();

function loadVtt(src: string): VttCue[] | Promise<VttCue[]> {
  const cached = cueCache.get(src);
  if (cached) return cached;
  const promise = globalThis.fetch(src)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((text) => {
      const cues = parseVtt(text);
      cueCache.set(src, cues);
      return cues;
    })
    .catch((err) => {
      console.warn('[vtt] failed to load', src, err);
      cueCache.delete(src); // allow retry on next mount
      return [] as VttCue[];
    });
  cueCache.set(src, promise);
  return promise;
}

/** Cues for a VTT URL: [] while loading, cached forever after. */
export function useVttCues(src: string | undefined): VttCue[] {
  const cached = src ? cueCache.get(src) : undefined;
  // useState-ok: loader-internal render trigger (componentLoader pattern)
  const [cues, setCues] = useState<VttCue[]>(Array.isArray(cached) ? cached : []);
  useEffect(() => {
    if (!src) return;
    const result = loadVtt(src);
    if (Array.isArray(result)) { setCues(result); return; }
    let stale = false;
    result.then((loaded) => { if (!stale) setCues(loaded); });
    return () => { stale = true; };
  }, [src]);
  return cues;
}

export function parseVtt(source: string): VttCue[] {
  const cues: VttCue[] = [];
  const blocks = source.replace(/\r/g, '').split('\n\n');
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const timingIdx = lines.findIndex((l) => l.includes('-->'));
    if (timingIdx < 0) continue; // header, NOTE, STYLE
    const [startRaw, endRaw] = lines[timingIdx].split('-->');
    const start = parseTime(startRaw);
    const end = parseTime(endRaw);
    if (start === null || end === null) continue;
    const text = lines.slice(timingIdx + 1).join('\n');
    if (text) cues.push({ start, end, text });
  }
  return cues;
}
