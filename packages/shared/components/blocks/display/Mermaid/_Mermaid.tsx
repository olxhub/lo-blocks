'use client';
import React, { useEffect, useId, useMemo, useRef } from 'react';
import mermaid from 'mermaid';
import { DisplayError } from '@/lib/util/debug';

mermaid.initialize({ startOnLoad: false, theme: 'default' });

export default function _Mermaid(props) {
  const { kids } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const uniqueId = useId().replace(/:/g, '_');

  // Synchronous validation — catches syntax errors before async render
  const parseError = useMemo(() => {
    if (!kids || !kids.trim()) return null;
    try {
      mermaid.parse(kids.trim());
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [kids]);

  // Async render for valid diagrams
  useEffect(() => {
    if (!kids || !kids.trim() || parseError || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const { svg } = await mermaid.render(`mermaid${uniqueId}`, kids.trim());
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (e) {
        // parse() passed but render() failed — unusual but possible
        if (!cancelled && containerRef.current) {
          containerRef.current.textContent = e instanceof Error ? e.message : String(e);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [kids, uniqueId, parseError]);

  if (!kids || !kids.trim()) {
    return <DisplayError props={props} name="Mermaid" message="Empty diagram" />;
  }

  if (parseError) {
    return <DisplayError props={props} name="Mermaid" message="Invalid diagram syntax" technical={parseError} />;
  }

  return <div ref={containerRef} />;
}
