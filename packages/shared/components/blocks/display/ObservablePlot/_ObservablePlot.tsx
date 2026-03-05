'use client';
import React, { useEffect, useRef } from 'react';
import * as Plot from '@observablehq/plot';
import YAML from 'yaml';
import { DisplayError } from '@/lib/util/debug';

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

export default function _ObservablePlot(props) {
  const { kids, format, width, height } = props;
  const containerRef = useRef<HTMLDivElement>(null);

  const effectiveFormat = format || 'yaml';

  useEffect(() => {
    if (!kids || !kids.trim() || !containerRef.current) return;
    const container = containerRef.current;

    try {
      let plotNode;

      if (effectiveFormat === 'js') {
        const result = evaluateJsSpec(kids, Plot);
        if (!(result instanceof Node)) {
          throw new Error('JS spec must return a DOM node (e.g. return Plot.plot({...}))');
        }
        plotNode = result;
      } else {
        const opts = parseYamlSpec(kids);
        if (width) opts.width = width;
        if (height) opts.height = height;
        plotNode = Plot.plot(opts);
      }

      container.replaceChildren(plotNode);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      container.innerHTML = '';
      const wrapper = document.createElement('div');
      wrapper.className = 'lo-display-error bg-yellow-50 text-yellow-800 text-sm p-3 rounded border border-yellow-200 whitespace-pre-wrap overflow-auto';
      wrapper.innerHTML = `<div><strong>ObservablePlot</strong>: Invalid plot spec</div>` +
        `<details style="margin-top:0.5rem;font-size:0.8rem"><summary>Technical Details</summary>` +
        `<pre class="overflow-auto mt-2">${msg}</pre></details>`;
      container.appendChild(wrapper);
    }
  }, [kids, effectiveFormat, width, height]);

  if (!kids || !kids.trim()) {
    return <DisplayError props={props} name="ObservablePlot" message="Empty plot spec" />;
  }

  return <div ref={containerRef} />;
}
