'use client';
import type { RuntimeProps } from '@/lib/types';
import React, { useEffect, useId, useRef } from 'react';
import mermaid from 'mermaid';
import { useFieldState } from '@/lib/state/redux';
import { useText } from '@/lib/player/client/useText';
import { renderBlockStatus } from '@/lib/player/client/renderBlockStatus';
import { DisplayError } from '@/lib/util/debug';
import { fields } from './Mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'default' });

export default function Mermaid(props: RuntimeProps) {
  const { text, ...status } = useText(props);
  const containerRef = useRef<HTMLDivElement>(null);
  // mermaid.render() needs a unique DOM ID for its internal temp element.
  // We can't use props.id — OLX is a DAG, so multiple <Use ref="..."/>
  // instances share the same block ID by design. useId() is unique per
  // React component instance, which is what we need here.
  const rendererId = useId().replace(/:/g, '_');
  const [error, setError] = useFieldState(props, fields.error, null);

  useEffect(() => {
    if (status.loading || !text || !text.trim() || !containerRef.current) return;
    let cancelled = false;
    const container = containerRef.current;

    (async () => {
      try {
        // parse() is async in mermaid v11
        await mermaid.parse(text.trim());
        const { svg } = await mermaid.render(`mermaid${rendererId}`, text.trim());
        if (!cancelled) {
          container.innerHTML = svg;
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => { cancelled = true; };
  }, [text, rendererId, status.loading, setError]);

  const statusView = renderBlockStatus(props, status);
  if (statusView) return statusView;

  if (!text || !text.trim()) {
    return <DisplayError props={props} title="Mermaid" message="Empty diagram" />;
  }

  return (
    <>
      {error && <DisplayError props={props} title="Mermaid" message="Invalid diagram syntax" technical={error} />}
      <div ref={containerRef} style={error ? { display: 'none' } : undefined} />
    </>
  );
}
