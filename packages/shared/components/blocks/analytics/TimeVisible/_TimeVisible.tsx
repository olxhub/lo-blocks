// packages/shared/components/blocks/analytics/TimeVisible/_TimeVisible.tsx
//
// Accumulates "attended seconds" into the block's `value` field.
//
// A second counts only when ALL of these hold:
//
//   1. The component is mounted.
//   2. The browser tab is foregrounded (document.visibilityState).
//   3. The block's own DOM node is laid out — i.e. it is not inside a
//      hidden container. A parent may keep inactive content mounted while
//      hiding it, so mount/unmount alone is NOT enough to stop the clock;
//      `offsetParent === null` catches the hidden case. This measures
//      an active panel, not viewport intersection: authors normally place one
//      timer anywhere inside the activity being measured.
//   4. The learner did something (key, pointer, scroll, touch) within the
//      last `idleTimeout` seconds. Time spent staring at a tab we cannot
//      see the learner engaging with is not study time.
//
// Writes are batched: the tick is 1s, but Redux is only written every
// FLUSH_SECONDS (and on unmount / tab-hide), so a 40-minute session costs
// ~480 events instead of ~2400.
//
// Restart semantics: `value` is a persisted field, so on remount we simply
// keep adding to whatever is already stored. Refresh continues the count.

'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useEffect, useRef } from 'react';
import { useFieldState } from '@/lib/state';
import { formatDuration } from '@/lib/util/duration';

const TICK_MS = 1000;
const FLUSH_SECONDS = 5;

// Activity is page-wide: TimeVisible measures time in the currently displayed
// activity, not interaction with the zero-size timer itself. All mounted
// timers share these document listeners; only their cheap one-second visibility
// check is per instance.
const ACTIVITY_EVENTS = ['keydown', 'mousemove', 'mousedown', 'wheel', 'scroll', 'touchstart'];
let activityTrackerUsers = 0;
let lastActivityAt = 0;

const markActive = () => { lastActivityAt = Date.now(); };

function trackPageActivity(): () => void {
  if (activityTrackerUsers === 0) {
    lastActivityAt = Date.now();
    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, markActive, { passive: true });
    }
  }
  activityTrackerUsers += 1;

  return () => {
    activityTrackerUsers -= 1;
    if (activityTrackerUsers !== 0) return;
    for (const event of ACTIVITY_EVENTS) document.removeEventListener(event, markActive);
  };
}

/**
 * Is this element actually being shown to the user right now?
 *
 * `offsetParent === null` detects when an ancestor has removed this node's
 * container from layout, covering mounted-but-hidden content without relying
 * on a particular container implementation. It is also true for
 * `position: fixed` nodes; TimeVisible renders a plain inline span, so that
 * case cannot arise here.
 */
function isCountingContextVisible(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
  return el.offsetParent !== null;
}

export default function TimeVisible(props: RuntimeProps) {
  const { fields, idleTimeout = 60, debug } = props;

  const [value, setValue] = useFieldState(props, fields.value, 0);

  const anchorRef = useRef<HTMLSpanElement | null>(null);
  // Latest committed total. We are the only writer of this field, so
  // mirroring it in a ref lets the interval add to it without re-subscribing.
  const committedRef = useRef<number>(value);
  committedRef.current = value;
  // Seconds counted but not yet written to Redux.
  const pendingRef = useRef<number>(0);
  const sideEffectFree = props.runtime.sideEffectFree;

  useEffect(() => {
    if (sideEffectFree) return;

    const stopTrackingActivity = trackPageActivity();

    const flush = () => {
      if (pendingRef.current <= 0) return;
      const total = committedRef.current + pendingRef.current;
      pendingRef.current = 0;
      committedRef.current = total;
      setValue(total);
    };

    const tick = () => {
      const idle = (Date.now() - lastActivityAt) / 1000 >= idleTimeout;
      if (!idle && isCountingContextVisible(anchorRef.current)) {
        pendingRef.current += TICK_MS / 1000;
      }
      if (pendingRef.current >= FLUSH_SECONDS) flush();
    };

    const interval = setInterval(tick, TICK_MS);

    // Hiding the tab is the one moment we are most likely to be killed
    // (mobile background, laptop close), so bank the partial seconds.
    const onVisibility = () => { if (document.visibilityState !== 'visible') flush(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      stopTrackingActivity();
      flush();
    };
  }, [idleTimeout, setValue, sideEffectFree]);

  // The anchor span is what rule 3 inspects — it must be a real, laid-out
  // node that inherits its container's visibility.
  if (debug) {
    return (
      <span ref={anchorRef} className="text-xs text-dimmed font-mono">
        ⏱ {formatDuration(value)}
      </span>
    );
  }

  return <span ref={anchorRef} aria-hidden="true" />;
}
