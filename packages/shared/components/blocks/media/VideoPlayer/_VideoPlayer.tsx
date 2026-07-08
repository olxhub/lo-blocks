// packages/shared/components/blocks/media/VideoPlayer/_VideoPlayer.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useEffect, useRef } from 'react';
import { useFieldState } from '@/lib/state';
import { updateField } from '@/lib/state/redux';
import { mediaFields } from '../mediaSync';

/**
 * The re-render story (deliberate): this component NEVER subscribes to
 * currentTime — it writes it (updateField, no hook, no subscription), so
 * playback ticks re-render nothing here. It subscribes only to the
 * human-speed intent fields (seekTarget, playing). Companions that need
 * the ticking clock (Transcript) subscribe themselves, as low in the
 * tree as possible.
 */
export default function VideoPlayer(props: RuntimeProps) {
  const { src, poster } = props as any;
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastAppliedSeek = useRef<number | null>(null);
  // Guard against echo: element events triggered by our own reconcile
  // must not re-write the intent they came from.
  const reconciling = useRef(false);

  const [seekTarget] = useFieldState(props, mediaFields.seekTarget, null);
  const [playing] = useFieldState(props, mediaFields.playing, false);

  // Apply seek intent — the ONE write path into the element's position.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || seekTarget == null || seekTarget === lastAppliedSeek.current) return;
    lastAppliedSeek.current = seekTarget;
    video.currentTime = seekTarget;
  }, [seekTarget]);

  // Reconcile play/pause intent (controlled-component pattern: anyone
  // writes `playing`; the element follows).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing && video.paused) {
      reconciling.current = true;
      video.play()?.catch(() => { /* autoplay policy — user gesture needed */ })
        .finally(() => { reconciling.current = false; });
    } else if (!playing && !video.paused) {
      reconciling.current = true;
      video.pause();
      reconciling.current = false;
    }
  }, [playing]);

  // Element → fields. currentTime is ENCODED (mediaSync.ts): per-tick
  // writes stay in local Redux and batch onto the wire.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => updateField(props, mediaFields.currentTime, video.currentTime);
    const onPlay = () => { if (!reconciling.current) updateField(props, mediaFields.playing, true); };
    const onPause = () => { if (!reconciling.current) updateField(props, mediaFields.playing, false); };
    const onRate = () => updateField(props, mediaFields.playbackRate, video.playbackRate);
    const onMeta = () => updateField(props, mediaFields.duration, video.duration);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ratechange', onRate);
    video.addEventListener('loadedmetadata', onMeta);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ratechange', onRate);
      video.removeEventListener('loadedmetadata', onMeta);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- props identity churns; listeners capture what they need
  }, []);

  return (
    <video
      ref={videoRef}
      className="w-full rounded"
      src={src}
      poster={poster}
      controls
    />
  );
}
