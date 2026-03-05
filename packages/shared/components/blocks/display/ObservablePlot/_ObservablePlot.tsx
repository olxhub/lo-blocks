'use client';
import React, { useEffect, useRef } from 'react';
import * as Plot from '@observablehq/plot';
import YAML from 'yaml';

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

/**
 * Translate a declarative mark spec into a Plot mark.
 *
 * YAML marks look like:
 *   { type: "barX", data: [...], x: "count", fill: "category" }
 *
 * Which maps to:
 *   Plot.barX(data, { x: "count", fill: "category" })
 *
 * For marks that take a single array arg (like ruleY):
 *   { type: "ruleY", data: [0] }
 *   → Plot.ruleY([0])
 */
function buildMark(spec) {
  const { type, data, ...options } = spec;
  const markFn = Plot[type];
  if (typeof markFn !== 'function') {
    throw new Error(`Unknown mark type: "${type}". See https://observablehq.com/plot/marks`);
  }
  return Object.keys(options).length > 0
    ? markFn(data, options)
    : markFn(data);
}

/**
 * Parse a YAML/JSON spec into a Plot.plot() options object.
 *
 * The spec can include any Plot.plot() option. The `marks` array
 * contains declarative mark objects with a `type` field.
 */
function parseYamlSpec(text: string) {
  const spec = YAML.parse(text);
  if (!spec || typeof spec !== 'object') {
    throw new Error('Plot spec must be a YAML/JSON object');
  }

  const { marks, ...plotOptions } = spec;

  if (marks) {
    if (!Array.isArray(marks)) throw new Error('"marks" must be an array');
    plotOptions.marks = marks.map(buildMark);
  }

  return plotOptions;
}

/**
 * Evaluate a JS format="js" spec using the local Plot library.
 *
 * The author's code is a function body with `Plot` available.
 * It should return a Plot node (the result of Plot.plot()).
 *
 * Security: This runs in the browser's main context (same as any
 * React component). For untrusted content, wrap in an iframe —
 * but courseware authors are trusted content creators.
 */
function evaluateJsSpec(code: string, plotLib: typeof Plot) {
  const fn = new Function('Plot', code);
  return fn(plotLib);
}

function renderError(container: HTMLDivElement, message: string, source: string) {
  container.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'text-red-600 border border-red-300 bg-red-50 p-3 rounded';
  wrapper.innerHTML = `<strong>Plot error:</strong> ${message}` +
    `<pre class="mt-2 text-sm text-gray-600 whitespace-pre-wrap">${source}</pre>`;
  container.appendChild(wrapper);
}

export default function _ObservablePlot(props) {
  const { kids, format, width, height } = props;
  const content = extractText(kids);
  const containerRef = useRef<HTMLDivElement>(null);

  const effectiveFormat = format || 'yaml';

  useEffect(() => {
    if (!content.trim() || !containerRef.current) return;

    try {
      let plotNode;

      if (effectiveFormat === 'js') {
        const result = evaluateJsSpec(content, Plot);
        if (!(result instanceof Node)) {
          throw new Error('JS spec must return a DOM node (e.g. return Plot.plot({...}))');
        }
        plotNode = result;
      } else {
        const opts = parseYamlSpec(content);
        if (width) opts.width = width;
        if (height) opts.height = height;
        plotNode = Plot.plot(opts);
      }

      containerRef.current.replaceChildren(plotNode);
    } catch (e) {
      renderError(containerRef.current, e instanceof Error ? e.message : String(e), content);
    }
  }, [content, effectiveFormat, width, height]);

  if (!content.trim()) {
    return <div className="text-gray-400 italic">Empty Observable Plot</div>;
  }

  return <div ref={containerRef} />;
}
