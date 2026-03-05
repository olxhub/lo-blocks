'use client';
import React, { useEffect, useId, useRef } from 'react';
import mermaid from 'mermaid';
import { useFieldState } from '@/lib/state/redux';
import { DisplayError } from '@/lib/util/debug';
import { fields } from './Mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'default' });

export default function _Mermaid(props) {
  const { kids } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  // mermaid.render() needs a unique DOM ID for its internal temp element.
  // We can't use props.id — OLX is a DAG, so multiple <Use ref="..."/>
  // instances share the same block ID by design. useId() is unique per
  // React component instance, which is what we need here.
  const rendererId = useId().replace(/:/g, '_');
  const [error, setError] = useFieldState(props, fields.error, null);

  useEffect(() => {
    if (!kids || !kids.trim() || !containerRef.current) return;
    let cancelled = false;
    const container = containerRef.current;

    (async () => {
      try {
        // parse() is async in mermaid v11
        await mermaid.parse(kids.trim());
        const { svg } = await mermaid.render(`mermaid${rendererId}`, kids.trim());
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
  }, [kids, rendererId]);

  if (!kids || !kids.trim()) {
    return <DisplayError props={props} name="Mermaid" message="Empty diagram" />;
  }

  return (
    <>
      {error && <DisplayError props={props} name="Mermaid" message="Invalid diagram syntax" technical={error} />}
      <div ref={containerRef} style={error ? { display: 'none' } : undefined} />
    </>
  );
}
