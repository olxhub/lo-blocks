'use client';
import React, { useEffect, useId, useRef } from 'react';
import mermaid from 'mermaid';
import { DisplayError } from '@/lib/util/debug';

mermaid.initialize({ startOnLoad: false, theme: 'default' });

export default function _Mermaid(props) {
  const { kids } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  // mermaid.render() needs a unique DOM ID for its internal temp element.
  // We can't use props.id — OLX is a DAG, so multiple <Use ref="..."/>
  // instances share the same block ID by design. useId() is unique per
  // React component instance, which is what we need here.
  const rendererId = useId().replace(/:/g, '_');

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
        }
      } catch (e) {
        if (!cancelled) {
          // Render DisplayError-style markup for consistency with platform error display
          const msg = e instanceof Error ? e.message : String(e);
          container.innerHTML = '';
          const wrapper = document.createElement('div');
          wrapper.className = 'lo-display-error bg-yellow-50 text-yellow-800 text-sm p-3 rounded border border-yellow-200 whitespace-pre-wrap overflow-auto';
          wrapper.innerHTML = `<div><strong>Mermaid</strong>: Invalid diagram syntax</div>` +
            `<details style="margin-top:0.5rem;font-size:0.8rem"><summary>Technical Details</summary>` +
            `<pre class="overflow-auto mt-2">${msg}</pre></details>`;
          container.appendChild(wrapper);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [kids, rendererId]);

  if (!kids || !kids.trim()) {
    return <DisplayError props={props} name="Mermaid" message="Empty diagram" />;
  }

  return <div ref={containerRef} />;
}
