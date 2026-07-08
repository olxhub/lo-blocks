// packages/shared/components/blocks/reference/AnswerDistribution/_AnswerDistribution.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useFieldState } from '@/lib/state';
import { commonFields } from '@/lib/state/commonFields';
import type { StateKey } from '@/lib/types';

/** Sibling-qualify the target id, same rule as every target attribute. */
function targetKey(props: RuntimeProps, target: string): StateKey {
  if (target.includes('/')) return target as StateKey;
  const nsEnd = String(props.id).lastIndexOf('/');
  return (nsEnd < 0 ? target : `${String(props.id).slice(0, nsEnd)}/${target}`) as StateKey;
}

export default function AnswerDistribution(props: RuntimeProps) {
  const { fields, target, seed, showBeforeAnswer } = props as any;

  // The derived distribution lives in THIS block's bucket (server-fed via
  // sharedComponent + lo_server_state patches); the viewer's own answer
  // lives in the TARGET's per-user bucket.
  const [distribution] = useFieldState(props, fields.distribution, undefined);
  const [ownAnswer] = useFieldState(props, commonFields.value, undefined, {
    stateKey: targetKey(props, target),
  });

  const counts: Record<string, number> =
    distribution ?? (seed ? safeParse(seed) : {});
  const answered = ownAnswer !== undefined && ownAnswer !== null && ownAnswer !== '';

  // The Peer Instruction discipline: no peeking at the class before
  // committing your own answer (override with showBeforeAnswer="true").
  if (!answered && showBeforeAnswer !== 'true') {
    return (
      <div className="p-3 border rounded text-sm text-muted-foreground">
        Answer to see how the class responded.
      </div>
    );
  }

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  const ownBin = answered
    ? (typeof ownAnswer === 'object' ? JSON.stringify(ownAnswer) : String(ownAnswer))
    : undefined;

  if (entries.length === 0) {
    return (
      <div className="p-3 border rounded text-sm text-muted-foreground">
        No responses yet.
      </div>
    );
  }

  return (
    <div className="p-3 border rounded">
      <div className="text-sm text-muted-foreground mb-2">
        Class responses ({total})
      </div>
      {entries.map(([bin, n]) => (
        <div key={bin} className="mb-1">
          <div className="flex justify-between text-sm">
            <span className={bin === ownBin ? 'font-bold' : ''}>
              {bin}{bin === ownBin ? ' — you' : ''}
            </span>
            <span>{n}</span>
          </div>
          <div className="h-2 rounded bg-muted overflow-hidden">
            <div
              className={`h-full ${bin === ownBin ? 'bg-accent' : 'bg-muted-foreground/40'}`}
              style={{ width: `${total > 0 ? (100 * n) / total : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function safeParse(seed: string): Record<string, number> {
  try { return JSON.parse(seed); } catch { return {}; }
}
