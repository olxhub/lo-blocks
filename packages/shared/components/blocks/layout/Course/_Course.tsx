// packages/shared/components/blocks/layout/Course/_Course.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useFieldState } from '@/lib/state';
import { useBlock, useKidsJson } from '@/lib/render';
import { getBlockByOLXId } from '@/lib/blocks';
import { stateKeyForGlobalRef } from '@/lib/types/id-grammar';
import type { StateRef } from '@/lib/types';
import ExpandIcon from '@/components/common/ExpandIcon';
import ResizableSidebar from '@/components/common/ResizableSidebar';
import { assertNamedObject } from '@/lib/types/kids';
import { useBlockTranslation } from '@/lib/i18n/blockI18n';

function CourseContent({ props, selectedChild }) {
  // selectedChild is a bare block id read out of the parsed section structure
  // (never through the OLX parser's attribute qualification). useBlock expects
  // a fully-qualified StateKey, so qualify it against this block's namespace —
  // the same thing getBlockByOLXId does internally, and mirroring
  // _NavigatorReadingDetail and the other dynamic-ref consumers.
  const stateKey = stateKeyForGlobalRef(selectedChild as StateRef, props.runtime.ns);
  const { block } = useBlock(props, stateKey);
  return <>{block}</>;
}

// Compute the first selectable (and currently-visible) ID from sections
function firstSelectableId(sections: any[], isVisible: (id: string) => boolean): string | null {
  for (const section of sections) {
    if (section.type === 'block' && section.id && isVisible(section.id)) return section.id;
    if (section.type === 'chapter') {
      const child = (section.children || []).find((c: any) => c.id && isVisible(c.id));
      if (child) return child.id;
    }
  }
  return null;
}

// Find the first chapter that has a currently-visible child, so the default
// expanded chapter isn't one whose children are all hidden by when= (which
// would render nothing and force an extra click). Mirrors firstSelectableId.
function firstChapterId(sections: any[], isVisible: (id: string) => boolean): string | null {
  for (const section of sections) {
    if (section.type === 'chapter'
        && (section.children || []).some((c: any) => c.id && isVisible(c.id))) {
      return section.id;
    }
  }
  return null;
}

function Course(props: RuntimeProps) {
  const { kids, fields, title } = props;
  const { t } = useBlockTranslation(props);
  const resolvedTitle = title || t('defaultCourseTitle');
  assertNamedObject(kids, ['sections']);
  const sections = (kids.sections || []) as any[];

  // Honor `when=` on course children, the same way Vertical/Sequential do:
  // run the flat list of child ids through the shared when= filter (useKidsJson)
  // and treat only the survivors as visible — both in the nav and as valid
  // selections. Memoized so the synthetic kid array is stable across renders.
  const childKids = React.useMemo(() => {
    const ids: string[] = [];
    for (const section of sections) {
      if (section.type === 'chapter') {
        for (const child of (section.children || [])) if (child.id) ids.push(child.id);
      } else if (section.id) {
        ids.push(section.id);
      }
    }
    return ids.map(id => ({ type: 'block', id }));
  }, [sections]);
  const visibleIds = new Set<string>(
    useKidsJson({ ...props, kids: childKids } as any).map((k: any) => k.id)
  );
  const isVisible = (id: string) => visibleIds.has(id);

  const [selectedChild, setSelectedChild] = useFieldState(props, fields.selectedChild,
    firstSelectableId(sections, isVisible));
  const [expandedChapter, setExpandedChapter] = useFieldState(props, fields.expandedChapter,
    firstChapterId(sections, isVisible));
  const [navCollapsed, setNavCollapsed] = useFieldState(props, fields.navCollapsed, false);

  const handleChapterClick = (chapterId) => {
    setExpandedChapter(expandedChapter === chapterId ? null : chapterId);
  };

  const handleChildClick = (childId) => {
    setSelectedChild(childId);
  };

  // Valid only if the selected child exists AND is currently visible (its
  // when= condition holds). A child hidden by when= falls back to empty state.
  const hasValidSelection = !!selectedChild && isVisible(selectedChild) && sections.some(section =>
    (section.type === 'block' && section.id === selectedChild) ||
    (section.type === 'chapter' && (section.children || []).some((child: any) => child.id === selectedChild))
  );

  return (
    <div className="course-container">
      {/* Left Navigation Accordion */}
      <ResizableSidebar
        as="div"
        defaultWidth={320}
        minWidth={200}
        maxWidth={500}
        collapsed={navCollapsed}
        onCollapsedChange={setNavCollapsed}
        label={t('courseNavigation')}
        className="course-navigation"
      >
        <div>
          <h1>{resolvedTitle}</h1>
        </div>

        <div>
          {sections.map((section) => {
            if (section.type === 'chapter') {
              // Drop children filtered out by when=, and the whole chapter if
              // none remain visible.
              const visibleChildren = (section.children || []).filter((child: any) => child.id && isVisible(child.id));
              if (visibleChildren.length === 0) return null;
              return (
                <div key={section.id}>
                  {/* Chapter Header */}
                  <button
                    className="course-chapter-header"
                    onClick={() => handleChapterClick(section.id)}
                  >
                    <div>
                      <span>{section.title}</span>
                      <ExpandIcon expanded={expandedChapter === section.id} />
                    </div>
                  </button>

                  {/* Chapter Children */}
                  {expandedChapter === section.id && (
                    <div className="course-chapter-children">
                      {visibleChildren.map((child) => {
                        const childId = child.id;
                        const childEntry = getBlockByOLXId(props, childId);
                        const title = childEntry?.attributes?.title || childEntry?.tag || childId;
                        return (
                          <button
                            key={childId}
                            onClick={() => handleChildClick(childId)}
                            className={`course-nav-leaf${selectedChild === childId ? ' selected' : ''}`}
                          >
                            {title}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // Loose block at top level — hidden when its when= condition fails.
            const blockId = section.id;
            if (!isVisible(blockId)) return null;
            const blockEntry = getBlockByOLXId(props, blockId);
            const blockTitle = blockEntry?.attributes?.title || blockEntry?.tag || blockId;
            return (
              <button
                key={blockId}
                onClick={() => handleChildClick(blockId)}
                className={`course-nav-leaf course-nav-top-level${selectedChild === blockId ? ' selected' : ''}`}
              >
                {blockTitle}
              </button>
            );
          })}
        </div>
      </ResizableSidebar>

      {/* Right Content Area */}
      <div className="course-content">
        {hasValidSelection && selectedChild ? (
          <CourseContent props={props} selectedChild={selectedChild} />
        ) : (
          <div className="course-empty-state">
            {t('selectSectionToBegin')}
          </div>
        )}
      </div>
    </div>
  );
}

export default Course;
