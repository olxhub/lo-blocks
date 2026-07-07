// packages/shared/components/blocks/display/Video/_Video.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useEffect, useRef, useState } from 'react';
import { useFieldState } from '@/lib/state';

interface Cue { start: number; end: number; text: string }

export default function Video(props: RuntimeProps) {
  const { fields, src, poster, transcript, transcriptLang = 'en' } = props as any;
  const videoRef = useRef<HTMLVideoElement>(null);

  // Intent-based sync (Video.ts): the player writes currentTime/playing/
  // rate/duration; it READS seekTarget and applies it.
  const [, setCurrentTime] = useFieldState(props, fields.currentTime, 0);
  const [seekTarget] = useFieldState(props, fields.seekTarget, null);
  const [, setPlaying] = useFieldState(props, fields.playing, false);
  const [, setRate] = useFieldState(props, fields.playbackRate, 1);
  const [, setDuration] = useFieldState(props, fields.duration, 0);
  const [, setSeekTarget] = useFieldState(props, fields.seekTarget, null);
  const [, setSeekSource] = useFieldState(props, fields.seekSource, null);

  // useState-ok: parsed VTT cues — a static-asset cache, not user state
  const [cues, setCues] = useState<Cue[]>([]);
  // useState-ok: derived from currentTime + cues each tick; replay recomputes it
  const [activeCue, setActiveCue] = useState(-1);
  const activeCueRef = useRef<HTMLButtonElement | null>(null);
  const lastAppliedSeek = useRef<number | null>(null);

  // Apply seekTarget → the ONE write path into the video's position.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || seekTarget == null || seekTarget === lastAppliedSeek.current) return;
    lastAppliedSeek.current = seekTarget;
    video.currentTime = seekTarget;
  }, [seekTarget]);

  // Player events → fields. currentTime is encoded, so per-tick writes
  // stay local and batch onto the wire (encode.ts).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      setCurrentTime(video.currentTime);
      // Track the active cue from the same tick.
      const t = video.currentTime;
      setActiveCue((prev) => {
        if (prev >= 0 && cues[prev] && t >= cues[prev].start && t < cues[prev].end) return prev;
        return cues.findIndex((c) => t >= c.start && t < c.end);
      });
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onRate = () => setRate(video.playbackRate);
    const onMeta = () => setDuration(video.duration);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cues]);

  // Load transcript cues via the browser's native VTT parser: a hidden
  // <track> parses the file; we read its cue list once loaded.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !transcript) return;
    // Known issue: jsdom (demo-render sweep) has no textTracks — the
    // optional chain is for the test environment, not the browser.
    const track = video.textTracks?.[0];
    if (!track) return;
    track.mode = 'hidden'; // parse + fire cuechange, no native overlay
    const read = () => {
      if (!track.cues) return;
      setCues([...track.cues].map((c: any) => ({
        start: c.startTime, end: c.endTime, text: c.text,
      })));
    };
    // Cues may already be loaded (cache) or arrive async.
    read();
    const el = video.querySelector('track');
    el?.addEventListener('load', read);
    return () => el?.removeEventListener('load', read);
  }, [transcript]);

  // Follow the video: keep the active cue in view.
  useEffect(() => {
    activeCueRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeCue]);

  const seekTo = (time: number, source: string) => {
    setSeekSource(source);
    setSeekTarget(time);
  };

  return (
    <div className="flex gap-4 items-start">
      <video
        ref={videoRef}
        className="flex-1 min-w-0 rounded"
        src={src}
        poster={poster}
        controls
        crossOrigin="anonymous"
      >
        {transcript && (
          <track kind="subtitles" src={transcript} srcLang={transcriptLang} default />
        )}
      </video>
      {transcript && cues.length > 0 && (
        <div className="w-72 max-h-96 overflow-y-auto border rounded p-2 text-sm">
          {cues.map((cue, i) => (
            <button
              key={i}
              ref={i === activeCue ? activeCueRef : undefined}
              onClick={() => seekTo(cue.start, 'transcript')}
              className={`block w-full text-left px-2 py-1 rounded hover:bg-muted ${
                i === activeCue ? 'bg-accent text-inverse' : ''
              }`}
            >
              {cue.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
