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
  /** Pre-computed CSS background color. When present, takes precedence
   *  over hue/saturation/lightness. Supports any CSS color value
   *  including color-mix() for automatic theme adaptation. */
  bg?: string;
}
