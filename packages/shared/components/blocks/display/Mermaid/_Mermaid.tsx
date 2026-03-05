'use client';
import React, { useEffect, useId, useRef } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'default' });

function extractText(kids) {
  if (typeof kids === 'string') return kids;
  if (Array.isArray(kids)) {
    return kids.map((kid) => {
      if (typeof kid === 'object' && kid.type === 'text') return kid.text;
      return typeof kid === 'string' ? kid : '';
    }).join('');
  }
  return '';
}

function renderError(container: HTMLDivElement, message: string, source: string) {
  container.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'text-red-600 border border-red-300 bg-red-50 p-3 rounded';
  wrapper.innerHTML = `<strong>Mermaid error:</strong> ${message}` +
    `<pre class="mt-2 text-sm text-gray-600 whitespace-pre-wrap">${source}</pre>`;
  container.appendChild(wrapper);
}

export default function _Mermaid(props) {
  const { kids } = props;
  const content = extractText(kids);
  const containerRef = useRef<HTMLDivElement>(null);
  const uniqueId = useId().replace(/:/g, '_');

  useEffect(() => {
    if (!content.trim() || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const { svg } = await mermaid.render(`mermaid${uniqueId}`, content.trim());
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (e) {
        if (!cancelled && containerRef.current) {
          renderError(containerRef.current, e instanceof Error ? e.message : String(e), content);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [content, uniqueId]);

  if (!content.trim()) {
    return <div className="text-gray-400 italic">Empty Mermaid diagram</div>;
  }

  return <div ref={containerRef} />;
}
