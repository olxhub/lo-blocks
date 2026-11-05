// packages/shared/components/blocks/layout/Course/_Course.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useFieldState } from '@/lib/state';
import { useBlock, useKidsJson } from '@/lib/player/client/render';
import { getBlockByDefinitionRef } from '@/lib/blocks';
import { stateKeyForGlobalRef } from '@/lib/types/id-grammar';
import type { StateRef } from '@/lib/types';
import ExpandIcon from '@/components/common/ExpandIcon';
import ResizableSidebar from '@/components/common/ResizableSidebar';
import { assertNamedObject } from '@/lib/types/kids';
import { useBlockTranslation } from '@/lib/i18n/blockI18n';

function CourseContent({ props, selectedChild }) {
  // selectedChild is a DefinitionKey read from the parsed section structure.
  // useBlock expects a StateKey; stateKeyForGlobalRef preserves its namespace
  // while establishing that runtime identity.
  const stateKey = stateKeyForGlobalRef(selectedChild as StateRef, props.runtime.ns);
  const { block } = useBlock(props, stateKey);
  return <>{block}</>;
}

// Compute the first selectable (and currently-visible) definition key from sections
function firstSelectableDefinitionKey(sections: any[], isVisible: (definitionKey: string) => boolean): string | null {
  for (const section of sections) {
    if (section.type === 'block' && section.definitionKey && isVisible(section.definitionKey)) return section.definitionKey;
    if (section.type === 'chapter') {
      const child = (section.children || []).find((c: any) => c.definitionKey && isVisible(c.definitionKey));
      if (child) return child.definitionKey;
    }
  }
  return null;
}

// Find the first chapter that has a currently-visible child, so the default
// expanded chapter isn't one whose children are all hidden by when= (which
// would render nothing and force an extra click). Mirrors firstSelectableDefinitionKey.
function firstChapterId(sections: any[], isVisible: (definitionKey: string) => boolean): string | null {
  for (const section of sections) {
    if (section.type === 'chapter'
        && (section.children || []).some((c: any) => c.definitionKey && isVisible(c.definitionKey))) {
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
  // run the flat list of child definition keys through the shared when= filter (useKidsJson)
  // and treat only the survivors as visible — both in the nav and as valid
  // selections. Memoized so the synthetic kid array is stable across renders.
  const childKids = React.useMemo(() => {
    const entries: any[] = [];
    // Carry the child's WHOLE reference, not just its definitionKey: a
    // <Use ref="x" when="..."/> keeps its gate in `overrides`, and dropping
    // that here left Use-gated course children permanently visible.
    const push = (child: any) => {
      if (!child?.definitionKey) return;
      entries.push({
        type: 'block',
        definitionKey: child.definitionKey,
        ...(child.stateKey ? { stateKey: child.stateKey } : {}),
        ...(child.overrides ? { overrides: child.overrides } : {}),
      });
    };
    for (const section of sections) {
      if (section.type === 'chapter') {
        for (const child of (section.children || [])) push(child);
      } else {
        push(section);
      }
    }
    return entries;
  }, [sections]);
  const visibleDefinitionKeys = new Set<string>(
    useKidsJson({ ...props, kids: childKids } as any).map((k: any) => k.definitionKey)
  );
  const isVisible = (definitionKey: string) => visibleDefinitionKeys.has(definitionKey);

  const [selectedChild, setSelectedChild] = useFieldState(props, fields.selectedChild,
    firstSelectableDefinitionKey(sections, isVisible));
  const [expandedChapter, setExpandedChapter] = useFieldState(props, fields.expandedChapter,
    firstChapterId(sections, isVisible));
  const [navCollapsed, setNavCollapsed] = useFieldState(props, fields.navCollapsed, false);

  const handleChapterClick = (chapterId) => {
    setExpandedChapter(expandedChapter === chapterId ? null : chapterId);
  };

  const handleChildClick = (definitionKey) => {
    setSelectedChild(definitionKey);
  };

  // Valid only if the selected child exists AND is currently visible (its
  // when= condition holds). A child hidden by when= falls back to empty state.
  const hasValidSelection = !!selectedChild && isVisible(selectedChild) && sections.some(section =>
    (section.type === 'block' && section.definitionKey === selectedChild) ||
    (section.type === 'chapter' && (section.children || []).some((child: any) => child.definitionKey === selectedChild))
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
              const visibleChildren = (section.children || []).filter((child: any) => child.definitionKey && isVisible(child.definitionKey));
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
                        const childDefinitionKey = child.definitionKey;
                        const childEntry = getBlockByDefinitionRef(props, childDefinitionKey);
                        const title = childEntry?.attributes?.title || childEntry?.tag || childDefinitionKey;
                        return (
                          <button
                            key={childDefinitionKey}
                            onClick={() => handleChildClick(childDefinitionKey)}
                            className={`course-nav-leaf${selectedChild === childDefinitionKey ? ' selected' : ''}`}
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
            const blockDefinitionKey = section.definitionKey;
            if (!isVisible(blockDefinitionKey)) return null;
            const blockEntry = getBlockByDefinitionRef(props, blockDefinitionKey);
            const blockTitle = blockEntry?.attributes?.title || blockEntry?.tag || blockDefinitionKey;
            return (
              <button
                key={blockDefinitionKey}
                onClick={() => handleChildClick(blockDefinitionKey)}
                className={`course-nav-leaf course-nav-top-level${selectedChild === blockDefinitionKey ? ' selected' : ''}`}
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
