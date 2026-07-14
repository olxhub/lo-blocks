// packages/shared/lib/lofs/providers/docs.ts
//
// Docs storage provider — block documentation examples as a content source.
//
// A translation layer over FileStorageProvider, mounted at `docs` in LOFS
// (file:docs://action/ActionButton.olx). OLX keys get PER-BLOCK namespaces:
// an example's namespace is `docs.<BlockName>`, where the owning block is
// found by basename prefix match — the same convention the block registry
// uses to associate example files with blocks (ActionButtonLLM.olx →
// ActionButton). Directories deliberately do NOT encode block identity:
// they exist for developer cohesion, and tightly-coupled blocks (an input
// and its grader, two views of the same data) share a directory by design.
//
// Why per-block namespaces:
//   - `id="essay"` stays readable in every block's docs. Independent block
//     authors WILL reuse ids like `essay` or `num`; the namespace absorbs
//     that (docs.ActionButton/essay vs docs.EssayGrader/essay) instead of
//     forcing defensive names like `essayForActionButtonDocs`.
//   - An example and its shared fixtures (ActionButtonEssays.includes.olx)
//     share a namespace, so a bare <Use ref="essay"/> resolves between them.
//   - Courses embed docs content with explicit qualification:
//     <Use ref="docs.ActionButton/essay"/>.
//
// Prefix ambiguity (Foo vs FooGrader): the LONGEST matching block name wins.
// When FooGrader is not itself a block, FooGrader.olx belongs to Foo — which
// is fine; it documents how to use Foo. Explicit overrides can come later if
// this misattributes something that matters.
//
// Files matching no block name (e.g. generated grammar previews like
// matching.pegjs.preview.olx) fall back to their containing directory:
// input/Matching/matching.pegjs.preview.olx → docs.Matching.
//
// _test/ holds intentionally-broken fixtures for parser error tests; they
// are excluded from scans entirely.

import path from 'path';
import { FileStorageProvider } from './file';
import { withoutVersion } from '../../types/address';
import { parseContentNamespace } from '../../types/id-grammar';
import type { ContentNamespace, LofsRef } from '../../types';
import { NamespaceResolutionError, type NamespaceResolution, type ContentFile } from '../../types/storage';

export class DocsStorageProvider extends FileStorageProvider {
  /** Registered block names, longest first, for prefix matching. */
  private readonly blockNames: string[];

  /**
   * @param blockNames - Registered block names, e.g.
   *   Object.values(BLOCK_REGISTRY).map(b => b.name). Injected by the caller
   *   rather than imported here so lib/lofs stays free of a components/
   *   dependency (the registry imports every block's blueprint).
   * @param baseDir - Root of the block source tree.
   */
  constructor(blockNames: string[], baseDir = 'packages/shared/components/blocks') {
    super(baseDir, 'docs');
    this.blockNames = [...blockNames].sort((a, b) => b.length - a.length);
  }

  /** The block owning a file, by longest basename prefix match. Null if none. */
  blockForFile(relPath: string): string | null {
    const base = path.basename(relPath);
    return this.blockNames.find(name => base.startsWith(name)) ?? null;
  }

  async namespaceFor(ref: LofsRef): Promise<NamespaceResolution> {
    const relPath = this.toRelativePath(withoutVersion(ref));
    const block = this.blockForFile(relPath);
    if (block) return { ns: parseContentNamespace(`docs.${block}`) };

    const dir = path.basename(path.dirname(relPath));
    if (dir && dir !== '.') return { ns: parseContentNamespace(`docs.${dir}`) };

    throw new NamespaceResolutionError(
      `"${relPath}" matches no registered block name and has no containing ` +
      `directory — cannot derive a docs namespace for it.`
    );
  }

  /** Is this file documentation content the sync should index?
   *  Excludes:
   *  - _test/ — intentionally-broken parser-error fixtures
   *  - *.pegjs.preview.olx — grammar preview TEMPLATES with {{CONTENT}}
   *    placeholders; only renderable after injectPreviewContent. The grammar
   *    docs UI renders them with injected samples, never raw. */
  private isDocsContent(relPath: string): boolean {
    return !relPath.startsWith('_test/') && !relPath.endsWith('.pegjs.preview.olx');
  }

  async listContent(): Promise<ContentFile[]> {
    const files = await super.listContent();
    return files.filter(f =>
      this.isDocsContent(this.toRelativePath(withoutVersion(f.id)))
    );
  }
}
