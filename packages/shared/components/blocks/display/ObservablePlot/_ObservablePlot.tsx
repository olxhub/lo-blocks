'use client';
import React, { useEffect, useMemo, useRef } from 'react';
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
// TODO: Validate YAML specs more thoroughly. Currently, a typo like "maarks"
// instead of "marks" silently renders an empty chart. We should:
// - Warn on unrecognized top-level keys (typo detection)
// - Show a visible placeholder (gray box with border) when Plot produces empty output
// - Consider validating against known Plot.plot() options
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

  // All Plot operations are synchronous — compute during render
  const { plotNode, error } = useMemo(() => {
    if (!kids || !kids.trim()) return { plotNode: null, error: null };

    try {
      let node;

      if (effectiveFormat === 'js') {
        const result = evaluateJsSpec(kids, Plot);
        if (!(result instanceof Node)) {
          throw new Error('JS spec must return a DOM node (e.g. return Plot.plot({...}))');
        }
        node = result;
      } else {
        const opts = parseYamlSpec(kids);
        if (width) opts.width = width;
        if (height) opts.height = height;
        node = Plot.plot(opts);
      }

      return { plotNode: node, error: null };
    } catch (e) {
      return { plotNode: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [kids, effectiveFormat, width, height]);

  // Mount the Plot-generated DOM node
  useEffect(() => {
    if (!plotNode || !containerRef.current) return;
    containerRef.current.replaceChildren(plotNode);
  }, [plotNode]);

  if (!kids || !kids.trim()) {
    return <DisplayError props={props} name="ObservablePlot" message="Empty plot spec" />;
  }

  if (error) {
    return <DisplayError props={props} name="ObservablePlot" message="Invalid plot spec" technical={error} />;
  }

  return <div ref={containerRef} />;
}
