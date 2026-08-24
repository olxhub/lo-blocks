// apps/static/src/StaticPage.test.tsx
//
// @vitest-environment jsdom
//
// The static shell must produce EXACTLY ONE scrollbar on every route.
//
// The page shell is pinned to the viewport and never scrolls; exactly one
// region inside it does. Which region depends on the root block:
//
//   - A viewport-locking root (Course, Studio) scrolls its own internal pane,
//     so the shell hands it a clipped, positioned region and scrolls nothing.
//   - Any other root flows at its natural height, so the shell's content
//     region scrolls it — the body scrollbar moved inward, nothing else.
//
// The historical bug: the shell was `min-h-screen` with an `overflow-auto`
// content region, and Course's container was `height: 100vh`. Status bar +
// 100vh + footer + padding exceeded the viewport, so the page grew a body
// scrollbar (scrolling only the chrome) alongside the course's own.
//
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Layout-only test: stub the content and chrome components so the assertions
// are about the shell's own boxes, not about Redux, content loading or config.
vi.mock('@/components/common/RenderOLX', () => ({
  default: () => <div data-testid="olx">content</div>,
}));
vi.mock('@/components/common/StatusBar', () => ({
  default: () => <div data-testid="statusbar">status</div>,
}));
vi.mock('@/components/common/Notice', () => ({
  default: () => <div data-testid="notice">notice</div>,
}));
vi.mock('@/lib/i18n/useLocaleAttributes', () => ({
  useLocaleAttributes: () => ({ lang: 'en', dir: 'ltr' }),
}));

const mockIdMap: Record<string, unknown> = {};
vi.mock('./StaticContentProvider', () => ({
  useStaticContent: () => ({ idMap: mockIdMap }),
}));

const { default: StaticPage } = await import('./StaticPage');

const KEY = 'demo.ns/root_block';

function renderWithRootTag(tag: string) {
  for (const k of Object.keys(mockIdMap)) delete mockIdMap[k];
  mockIdMap[KEY] = {
    'en-Latn-US:default': { id: 'root_block', tag, attributes: {} },
  };
  return render(<StaticPage definitionKey={KEY} />);
}

/** The shell root: viewport-pinned, non-scrolling, on every route. */
function shell(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.lo-static-shell');
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

describe('StaticPage shell — one scrollbar per route', () => {
  it('pins the shell to the viewport and never scrolls it (Course root)', () => {
    const { container } = renderWithRootTag('Course');
    const classes = shell(container).className.split(/\s+/);
    expect(classes).toContain('h-screen');
    expect(classes).toContain('overflow-hidden');
    // min-h-screen would let the column grow past the viewport and put the
    // scrollbar back on the body — the original bug.
    expect(classes).not.toContain('min-h-screen');
  });

  it('pins the shell to the viewport and never scrolls it (non-Course root)', () => {
    const { container } = renderWithRootTag('Vertical');
    const classes = shell(container).className.split(/\s+/);
    expect(classes).toContain('h-screen');
    expect(classes).toContain('overflow-hidden');
    expect(classes).not.toContain('min-h-screen');
  });

  it('gives a Course root the region to fill, and scrolls nothing itself', () => {
    const { container } = renderWithRootTag('Course');

    const region = container.querySelector('.lo-viewport-lock') as HTMLElement;
    expect(region).not.toBeNull();
    const classes = region.className.split(/\s+/);
    // Positioned, so course.css can fill it with `position: absolute; inset: 0`
    // without a percentage-height chain through RenderOLX's block wrappers.
    expect(classes).toContain('relative');
    // The course scrolls its own pane; this region must not add a second one.
    expect(classes).toContain('overflow-hidden');
    expect(classes).not.toContain('overflow-auto');
    // A flex child will not shrink below its content without this.
    expect(classes).toContain('min-h-0');

    // No scrolling region anywhere in the shell.
    expect(container.querySelectorAll('.overflow-auto')).toHaveLength(0);
    expect(container.querySelector('.lo-static-scroll')).toBeNull();
  });

  it('is case-insensitive about the root tag', () => {
    const { container } = renderWithRootTag('course');
    expect(container.querySelector('.lo-viewport-lock')).not.toBeNull();
  });

  it('locks the viewport for a Studio root too', () => {
    const { container } = renderWithRootTag('Studio');
    expect(container.querySelector('.lo-viewport-lock')).not.toBeNull();
  });

  it('scrolls the content region for a non-viewport-locking root', () => {
    const { container } = renderWithRootTag('Vertical');

    expect(container.querySelector('.lo-viewport-lock')).toBeNull();

    const region = container.querySelector('.lo-static-scroll') as HTMLElement;
    expect(region).not.toBeNull();
    const classes = region.className.split(/\s+/);
    expect(classes).toContain('overflow-auto');
    expect(classes).toContain('min-h-0');

    // Exactly one scrolling box in the whole shell.
    expect(container.querySelectorAll('.overflow-auto')).toHaveLength(1);

    // Content keeps its page padding (which moved off the scroll region so the
    // region's own box, not the padding, defines the scrollport).
    expect(region.querySelector('.p-6')).not.toBeNull();
  });

  it('scrolls the footer with the content on ordinary pages', () => {
    const { container } = renderWithRootTag('Vertical');
    const region = container.querySelector('.lo-static-scroll') as HTMLElement;
    // Same reading order as when the body scrolled: footer after the content.
    expect(region.querySelector('footer')).not.toBeNull();
  });

  it('keeps the footer below the locked region, where it stays reachable', () => {
    const { container } = renderWithRootTag('Course');
    const region = container.querySelector('.lo-viewport-lock') as HTMLElement;
    // Inside the locked region the footer would be covered by the course's
    // absolutely-positioned container; it belongs to the shell column.
    expect(region.querySelector('footer')).toBeNull();
    expect(shell(container).querySelector(':scope > footer')).not.toBeNull();
  });

  it('keeps the status bar visible on every route', () => {
    for (const tag of ['Course', 'Vertical', 'Cast']) {
      const { container, unmount } = renderWithRootTag(tag);
      // A direct child of the non-scrolling shell column: always on screen.
      expect(shell(container).querySelector(':scope > [data-testid="statusbar"]')).not.toBeNull();
      unmount();
    }
    expect(screen.queryAllByTestId('statusbar')).toHaveLength(0);
  });

  it('treats a Cast root (the journals) as ordinary flowing content', () => {
    const { container } = renderWithRootTag('Cast');
    expect(container.querySelector('.lo-viewport-lock')).toBeNull();
    expect(container.querySelectorAll('.overflow-auto')).toHaveLength(1);
  });

  it('renders the content on both paths', () => {
    for (const tag of ['Course', 'Cast']) {
      const { unmount } = renderWithRootTag(tag);
      expect(screen.getByTestId('olx')).toBeDefined();
      unmount();
    }
  });
});
