// packages/shared/components/blocks/media/Video/_Video.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useFieldState } from '@/lib/state';
import VideoPlayer from '../VideoPlayer/_VideoPlayer';
import Transcript from '../Transcript/_Transcript';

/**
 * React-level composition: both children receive THIS block's props, so
 * player and transcript share one media bucket (no target wiring). This
 * component subscribes only to showTranscript — playback ticks re-render
 * the Transcript leaf, not this wrapper or the player.
 */
export default function Video(props: RuntimeProps) {
  const { fields, transcript } = props as any;
  const [showTranscript, setShowTranscript] = useFieldState(props, fields.showTranscript, true);

  return (
    <div>
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          <VideoPlayer {...props} />
        </div>
        {transcript && showTranscript && (
          <div className="w-72">
            <Transcript {...props} src={transcript} target={undefined} />
          </div>
        )}
      </div>
      {transcript && (
        <button
          className="mt-1 text-sm text-muted-foreground hover:underline"
          onClick={() => setShowTranscript(!showTranscript)}
        >
          {showTranscript ? 'Hide transcript' : 'Show transcript'}
        </button>
      )}
    </div>
  );
}
