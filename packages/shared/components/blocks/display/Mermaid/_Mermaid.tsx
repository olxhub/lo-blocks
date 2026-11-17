'use client';
import type { RuntimeProps } from '@/lib/types';
import React, { useEffect, useId, useRef } from 'react';
import mermaid from 'mermaid';
import { useFieldState } from '@/lib/state/redux';
import { useTextWithTemplate } from '@/lib/player/client/useText';
import { renderBlockStatus } from '@/lib/player/client/renderBlockStatus';
import { DisplayError } from '@/lib/util/debug';
import { fields } from './Mermaid';

// Use the site's web font, not mermaid's default system-font stack
// ("trebuchet ms", verdana, arial). Firefox font-visibility (fingerprinting
// protection / strict ETP) blocks those system fonts; a web font is never
// blocked, and it matches the site typography. Same family as --lo-font-ui.
const MERMAID_FONT = "'Geist Sans', system-ui, sans-serif";
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  fontFamily: MERMAID_FONT,
  themeVariables: { fontFamily: MERMAID_FONT },
});

// <HACK> Firefox 159 shifted-viewBox workaround (fitMermaidViewBox)
//
// Added 2026-11-05. If you are reading this long after that date, try
// removing it: delete every <HACK>...</HACK> block in this file, open the
// repro below in current Firefox, and keep the code out if the diagram is
// whole. It is a no-op on browsers that measure correctly, so it only costs
// dead weight, but dead weight accumulates.
//
// Versions: mermaid 10.9.6, Firefox 159.0 (Ubuntu snap, revision 9137).
// Does not reproduce in Chromium, nor in Playwright's Firefox build 1509
// (about Firefox 145). So it looks like a Firefox regression, probably in
// getBBox() over groups that contain foreignObject (mermaid's HTML labels),
// but the exact trigger was not isolated and nothing is filed upstream.
//
// Symptom: mermaid sets the flowchart viewBox from the root getBBox(). In
// Firefox 159 that box behaves as if every node group were still centred
// on the origin, untransformed, while the groups are drawn at their real
// transforms. The viewBox origin ends up shifted up and left by half the
// widest node plus mermaid's 8px padding, e.g. "-108 -33 403 446" instead
// of "-8 -8 403 446", and the right column of a `graph LR` is clipped at
// the svg's own edge. Setting the viewBox by hand to "0 0 w h" renders it
// correctly. Ruled out: fonts (system fonts blocked by font-visibility; a
// web font changed nothing), htmlLabels:false, zoom, extensions, render
// races (identical on every reload).
//
// Workaround: once the svg is in the DOM, take the union of the drawn
// elements' client rects, convert to user units, and rewrite the viewBox
// only if content overflows it. Measured no-op in Chromium and Firefox 1509.
//
// To replicate: render this graph with mermaid.render() in a plain page
// and print the svg's viewBox and each g.node transform (a ready page is
// at tmp/mermaid-debug/repro.html in a checkout that still has it):
//
//   graph LR
//       C1[Students need money<br/>to help family] --> D1[Economics]
//       C1 --> D2[Sociology]
//       C2[Depression/anxiety/ADHD<br/>interferes] --> D3[Psychology]
//       C2 --> D4[Health Sciences]
//       C3[Gang activity /<br/>neighborhood instability] --> D2
//       C3 --> D5[Political Science]
//       C4[Lack of school<br/>funding] --> D1
//       C4 --> D5
//
// Good: viewBox origin "-8 -8", about 400 wide by 445 to 485 high (font
// and line-height dependent); left nodes at translate(~100, y), right at
// translate(~317, y).
// Bad (Firefox 159): origin about "-108 -33", same transforms.
// In the product: Firefox 159 at 100% zoom, ~1880px window, course
// edu.gsu.interdisciplinary, Part 1, step 8 of 13 ("Discipline Mapping
// Summary", right pane of the SplitPanel). The graph lives in
// interdisciplinary/interdiscip_activities_part1.olx there.
//
// Upstream: <none filed>
//
// Upstream: <none filed>
const DRAWN = 'path, rect, circle, ellipse, polygon, polyline, line, text, foreignObject, image';
// Returns false if the svg has no layout yet (rendered inside a hidden pane).
function fitMermaidViewBox(svg: SVGSVGElement, pad = 8): boolean {
  const vb = svg.viewBox.baseVal;
  const box = svg.getBoundingClientRect();
  if (!vb || !vb.width || !box.width || !box.height) return false;
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  svg.querySelectorAll(DRAWN).forEach((el) => {
    if (el.closest('defs, marker')) return;
    const c = el.getBoundingClientRect();
    if (!c.width && !c.height) return;
    l = Math.min(l, c.left); t = Math.min(t, c.top);
    r = Math.max(r, c.right); b = Math.max(b, c.bottom);
  });
  if (l === Infinity) return true;
  const sx = vb.width / box.width, sy = vb.height / box.height;
  const x0 = vb.x + (l - box.left) * sx, y0 = vb.y + (t - box.top) * sy;
  const x1 = vb.x + (r - box.left) * sx, y1 = vb.y + (b - box.top) * sy;
  const tol = 2;
  if (x0 >= vb.x - tol && y0 >= vb.y - tol
      && x1 <= vb.x + vb.width + tol && y1 <= vb.y + vb.height + tol) return true;
  const w = x1 - x0 + 2 * pad, h = y1 - y0 + 2 * pad;
  svg.setAttribute('viewBox', `${x0 - pad} ${y0 - pad} ${w} ${h}`);
  if (svg.style.maxWidth) svg.style.maxWidth = `${w}px`;
  return true;
}
// </HACK>

export default function Mermaid(props: RuntimeProps) {
  const { text, ...status } = useTextWithTemplate(props);
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
        // Labels are measured at render time; wait for the web font.
        await document.fonts?.ready;
        // parse() is async in mermaid v11
        await mermaid.parse(text.trim());
        const { svg } = await mermaid.render(`mermaid${rendererId}`, text.trim());
        if (!cancelled) {
          container.innerHTML = svg;
          setError(null);
          // <HACK> Firefox 159 shifted viewBox; see fitMermaidViewBox above.
          const el = container.querySelector('svg');
          if (el && !fitMermaidViewBox(el)) {
            // Hidden at render time: retry once it has a size. Stops when the
            // effect is cancelled or the svg is replaced/unmounted (removal
            // also fires the observer), so no cleanup hook is needed.
            const observer = new ResizeObserver(() => {
              if (cancelled || !el.isConnected || fitMermaidViewBox(el)) observer.disconnect();
            });
            observer.observe(container);
          }
          // </HACK>
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
