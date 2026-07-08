// packages/shared/components/blocks/media/mediaSync.ts
//
// The COMMON media synchronization API (docs/video-block-design.md).
// Everything in /media/ — video, audio (future), transcripts, scrubbers,
// analytics overlays, animations — synchronizes through ONE contract:
//
//   Fields (mediaFields, one bucket per player):
//     currentTime   where playback actually is. Written by the PLAYER
//                   only; encoded (aggregate events on the wire, sample
//                   expansion in replay).
//     seekTarget    where someone wants it to be. Written by everyone
//                   EXCEPT the player; the player applies it. Single-
//                   writer discipline in both directions = no races.
//     seekSource    provenance of the last seek (transcript, scrubber,
//                   keyboard, api) — analytics reads this.
//     playing       desired playback state. Anyone may write; the player
//                   reconciles the element to it (controlled-component
//                   pattern), and reports element-initiated changes back.
//     playbackRate, duration — plain LWW.
//
//   Locals (mediaLocals, exported by player blocks): imperative verbs
//   over the same fields — play/pause/toggle/gotoTimestamp. Callable by
//   any block holding props (a Transcript, an ActionButton, the state
//   language). They only WRITE FIELDS, so everything stays replayable.
//
// Companion blocks find their player via target="playerId" (sibling id,
// ns-qualified like every other target attribute); no target = share the
// block's own bucket (the composed <Video> case).

import * as state from '@/lib/state';
import { trace } from '@/lib/state/encoders';
import { updateField } from '@/lib/state/redux';
import type { BaselineProps, RuntimeProps, StateKey } from '@/lib/types';

export const mediaFields = state.fields([
  { name: 'currentTime', encoder: trace({ debounceMs: 5000, maxPoints: 100 }) },
  'seekTarget',
  'seekSource',
  'playing',
  'playbackRate',
  'duration',
]);

/** Resolve a companion block's player bucket: the target attribute
 * (sibling id, qualified with this block's namespace), or its own id. */
export function mediaStateKeyFor(props: RuntimeProps, target?: string): StateKey {
  if (!target) return props.id as unknown as StateKey;
  if (target.includes('/')) return target as StateKey;
  const nsEnd = String(props.id).lastIndexOf('/');
  return (nsEnd < 0 ? target : `${String(props.id).slice(0, nsEnd)}/${target}`) as StateKey;
}

/** Imperative media verbs — thin writes over mediaFields. `stateKey`
 * targets another player's bucket; omit it inside the player itself. */
export const mediaLocals = {
  play(props: BaselineProps, stateKey?: StateKey) {
    updateField(props, mediaFields.playing, true, { stateKey });
  },
  pause(props: BaselineProps, stateKey?: StateKey) {
    updateField(props, mediaFields.playing, false, { stateKey });
  },
  gotoTimestamp(props: BaselineProps, time: number, source = 'api', stateKey?: StateKey) {
    updateField(props, mediaFields.seekSource, source, { stateKey });
    updateField(props, mediaFields.seekTarget, time, { stateKey });
  },
};
