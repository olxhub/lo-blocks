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
