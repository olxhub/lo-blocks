// Shared types for text highlight rendering.
// Used by analysis functions and TextHighlightRenderer.

export interface HighlightSpan {
  offset: number;
  length: number;
}

export interface HighlightEntry {
  id: string;
  spans: HighlightSpan[];
  label: string;
  group: string;
  hue: number;
  saturation: number;
  lightness: number;
}
