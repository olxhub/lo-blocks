'use client';
// packages/shared/components/blocks/authoring/BlockDoc/docPanels.tsx
//
// Shared presentational pieces for documentation views — used by both
// _BlockDoc (block docs) and DocsBrowser's grammarDocContent (format docs)
// so the two stay visually identical: header (title/description/chips),
// tab strip, live-preview panel, and the titled bordered card that wraps
// READMEs, sources, and example code.

import React from 'react';
import type { ContentNamespace, BlockDocRecord } from '@/lib/types';
import type { AttributeDoc } from '@/lib/docs/schemaUtils';
import { OLXCodeBlock } from '@/components/common/OLXCodeBlock';
import RenderOLX from '@/components/common/RenderOLX';
import Spinner from '@/components/common/Spinner';
import { useContentLoader } from '@/lib/content/useContentLoader';
import {
  parseStateKey, parseDefinitionKey, splitNs, leafDefinitionKeyFromStateKey,
} from '@/lib/types/id-grammar';

export function DocHeader({ title, description, chips }: {
  title: string;
  description?: string | null;
  /** Chip labels; `accent: true` renders the highlighted variant (e.g. the
   *  "PEG Grammar" badge). */
  chips: { label: string; accent?: boolean }[];
}) {
  return (
    <div className="bg-background border-b px-6 py-4">
      <h2 className="text-xl font-bold text-foreground">{title}</h2>
      {description && <p className="text-secondary mt-1">{description}</p>}
      <div className="flex flex-wrap gap-2 mt-2">
        {chips.map(chip => (
          <span
            key={chip.label}
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              chip.accent ? 'bg-accent-subtle text-accent' : 'bg-muted text-foreground'
            }`}
          >
            {chip.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DocTabs({ tabs, active, onSelect }: {
  tabs: { id: string; label: string }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="bg-background border-b px-6">
      <nav className="flex gap-4 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab.id === active
                ? 'border-accent text-accent'
                : 'border-transparent text-dimmed hover:text-secondary hover:border-border'
            }`}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Render an already-indexed block by DefinitionKey through the standard
 *  content pipeline (useContentLoader + RenderOLX, PreviewPage's core).
 *  The indexed copy was parsed in place with real provenance, so relative
 *  src=/cast= companion files resolved at parse time — the reason example
 *  previews render by id rather than re-parsing their text inline. */
function RenderIndexed({ rootId }: { rootId: string }) {
  const stateKey = parseStateKey(rootId);
  const { idMap, error, loading } = useContentLoader(leafDefinitionKeyFromStateKey(stateKey));

  if (error) return <div className="text-error text-sm">Failed to load example: {String(error)}</div>;
  if (loading) return <Spinner>Loading example…</Spinner>;

  return (
    <RenderOLX
      id={stateKey}
      ns={splitNs(parseDefinitionKey(rootId)).ns}
      baseIdMap={idMap ?? undefined}
      eventContext="docs"
    />
  );
}

/** Live-rendered OLX in the standard "Live Preview" frame.
 *
 *  Pass `rootId` (an indexed example's DefinitionKey) to render through the
 *  content pipeline — required for multifile examples. `olx` re-parses the
 *  string inline; use it only for synthetic content with no file identity
 *  (grammar preview-template injections, README code fences). */
export function LivePreviewPanel({ olx, rootId, ns }: {
  olx?: string;
  rootId?: string | null;
  ns: ContentNamespace;
}) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-muted border-b text-xs text-dimmed">Live Preview</div>
      <div className="p-4 bg-background">
        {rootId
          ? <RenderIndexed rootId={rootId} />
          : olx !== undefined && <OLXCodeBlock language="olx:render" ns={ns}>{olx}</OLXCodeBlock>}
      </div>
    </div>
  );
}

/** Titled bordered card for file-like content (README, sources, example
 *  code). `path` renders dimmed on the right of the title bar. */
export function FileCard({ title, path, children }: {
  title: string;
  path?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background rounded-lg border overflow-hidden">
      <div className="px-4 py-3 bg-surface border-b flex justify-between items-center">
        <span className="font-medium text-foreground">{title}</span>
        {path && <code className="text-xs text-dimmed">{path}</code>}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block interface: attributes and fields
// ---------------------------------------------------------------------------

// Authoring-time vs runtime — the distinction users asked about, as
// hover help on the section labels.
const ATTRIBUTES_HELP =
  'Attributes configure a block when authoring OLX markup (e.g. title="…"). ' +
  'They are fixed once written.';
const FIELDS_HELP =
  'Fields are the block’s runtime state — values that change as learners ' +
  'interact (answers, scores, UI state). Not set in markup.';

const GROUP_LABELS: Record<string, string> = {
  base: 'Base attributes (all blocks)',
  input: 'Input attributes',
  grader: 'Grader attributes',
};

function HelpLabel({ text, help }: { text: string; help: string }) {
  return (
    <span className="cursor-help border-b border-dotted border-border" title={help}>
      {text}
    </span>
  );
}

/** Block-specific attributes as a table; shared mixin attributes (base /
 *  input / grader — whatever groups the data carries) as compact lines
 *  with description mouseovers. Grouping comes from the wire (`group`,
 *  computed where the mixin schemas live) — no client-side set matching. */
export function AttributesSection({ attributes }: { attributes: AttributeDoc[] }) {
  const own = attributes.filter(a => (a.group ?? 'own') === 'own');
  const shared = Object.keys(GROUP_LABELS)
    .map(group => ({ group, attrs: attributes.filter(a => a.group === group) }))
    .filter(s => s.attrs.length > 0);
  if (!attributes.length) return null;

  return (
    <section>
      <h4 className="font-medium text-foreground mb-3">
        <HelpLabel text="Attributes" help={ATTRIBUTES_HELP} />
      </h4>
      {own.length > 0 && (
        <table className="w-full text-sm mb-4">
          <thead>
            <tr>
              <th className="text-start py-2 pe-4 font-medium text-secondary">Name</th>
              <th className="text-start py-2 pe-4 font-medium text-secondary">Type</th>
              <th className="text-start py-2 font-medium text-secondary">Description</th>
            </tr>
          </thead>
          <tbody>
            {own.map(attr => (
              <tr key={attr.name} className="border-b border-border-subtle">
                <td className="py-2 pe-4 align-top">
                  <code className="text-accent">{attr.name}</code>
                  {attr.required && <span className="text-error ms-1">*</span>}
                </td>
                <td className="py-2 pe-4 align-top">
                  {attr.enumValues?.length
                    ? attr.enumValues.map((v, i) => (
                        <React.Fragment key={v}>
                          {i > 0 && ' | '}
                          <span className="text-success">"{v}"</span>
                        </React.Fragment>
                      ))
                    : <span className="font-mono text-xs text-secondary">{attr.type}</span>}
                </td>
                <td className="py-2 text-secondary">
                  {attr.description}
                  {attr.default !== undefined && ` (default: ${JSON.stringify(attr.default)})`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="space-y-1 text-sm text-dimmed">
        {shared.map(({ group, attrs }) => (
          <div key={group}>
            <span className="font-medium">{GROUP_LABELS[group]}: </span>
            {attrs.map((attr, i) => (
              <span key={attr.name}>
                {i > 0 && ', '}
                <code
                  className="text-secondary cursor-help border-b border-dotted border-border"
                  title={attr.description || attr.name}
                >
                  {attr.name}
                </code>
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Fields as a compact line — the shape is open (the field system grows),
 *  so render name plus whatever description a field carries. */
export function FieldsSection({ fields }: { fields: Array<{ name: string } & Record<string, unknown>> }) {
  if (!fields.length) return null;
  return (
    <section className="text-sm">
      <span className="font-medium text-foreground me-2">
        <HelpLabel text="Fields" help={FIELDS_HELP} />:
      </span>
      {fields.map((field, i) => (
        <span key={field.name}>
          {i > 0 && ', '}
          <code
            className="text-secondary cursor-help border-b border-dotted border-border"
            title={typeof field.description === 'string' ? field.description : field.name}
          >
            {field.name}
          </code>
        </span>
      ))}
    </section>
  );
}

/** The Quick Reference card: identity (tag, source, namespace), fields,
 *  attributes — composed from the same sections the standalone
 *  DocAttributes / DocFields blocks render. */
export function BlockQuickReference({ block }: { block: BlockDocRecord }) {
  const attributes = (block.attributes ?? []) as AttributeDoc[];
  return (
    <section className="bg-background rounded-lg border p-6 flex flex-col gap-5">
      <h3 className="font-medium text-foreground">Quick Reference</h3>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-dimmed">Block</dt>
        <dd className="font-mono">&lt;{block.name}/&gt;</dd>
        {block.source && (
          <>
            <dt className="text-dimmed">Source</dt>
            <dd className="font-mono text-xs break-all">{block.source}</dd>
          </>
        )}
        {block.namespace && (
          <>
            <dt className="text-dimmed">Namespace</dt>
            <dd className="font-mono text-xs">{block.namespace}</dd>
          </>
        )}
      </dl>
      <FieldsSection fields={block.fields ?? []} />
      <AttributesSection attributes={attributes} />
    </section>
  );
}
