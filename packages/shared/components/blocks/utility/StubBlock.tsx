// packages/shared/components/blocks/utility/StubBlock.tsx
import * as parsers from '@/lib/content/parsers';

import { dev } from '@/lib/blocks';
const warnedBlocks = new Set();

/**
 * Creates a stub block for tags that are parsed but not rendered as full blocks.
 * Used for structural markers like MainPane/Sidebar that are consumed by their parent.
 *
 * @param {string} name - Block name
 * @param {object} options - Optional configuration
 * @param {string} options.description - Block description
 * @param {boolean} options.internal - Whether to hide from docs
 */
export default function createStubBlock(name, options: { description?: string; internal?: boolean } = {}) {
  return dev({
    name,
    description: options.description,
    internal: options.internal,
    component: ({ id, ...props }) => {
      if (!warnedBlocks.has(name)) {
        console.warn(`[StubBlock] "${name}" is not yet implemented.`);
        warnedBlocks.add(name);
      }

      const summarizeValue = (value) => {
        if (value == null) return 'null';
        if (typeof value === 'string') {
          return value.length > 80 ? `"${value.slice(0, 80)}..."` : `"${value}"`;
        }
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        if (Array.isArray(value)) return `[Array(${value.length})]`;
        if (typeof value === 'object') return '{Object}';
        return typeof value;
      };

      const summaryLines = Object.entries(props).map(([key, value]) => (
        <div key={key} className="ml-2">
          <span className="text-dimmed">{key}:</span> {summarizeValue(value)}
        </div>
      ));

      return (
        <div
          className="border border-border bg-surface rounded-md p-2 my-2 shadow-sm text-xs text-secondary font-mono whitespace-pre-wrap"
          data-stub={name}
        >
          <div className="border-b border-border mb-1 pb-1 flex items-center gap-2">
            <span className="text-sm font-bold text-accent">🛠️ Stub: {name}</span>
            <span className="text-dimmed">(ID: {id ?? 'n/a'})</span>
          </div>

          {Object.keys(props).length > 0 && (
            <details>
              <summary className="cursor-pointer text-dimmed hover:text-secondary">
                Show props ({Object.keys(props).length})
              </summary>
              <div className="mt-1">{summaryLines}</div>
            </details>
          )}
        </div>
      );
    },
    ...parsers.ignore(),
    // no kids expected,
  });
}
