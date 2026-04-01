// src/components/blocks/Course/_Course.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useFieldState } from '@/lib/state';
import { useBlock } from '@/lib/render';
import { getBlockByOLXId } from '@/lib/blocks';
import ExpandIcon from '@/components/common/ExpandIcon';
import ResizableSidebar from '@/components/common/ResizableSidebar';
import { assertNamedObject } from '@/lib/util/kids';
import { useBlockTranslation } from '@/lib/i18n/blockI18n';

function CourseContent({ props, selectedChild }) {
  const { block } = useBlock(props, selectedChild);
  return <>{block}</>;
}

function _Course(props: RuntimeProps) {
  const { kids, fields, title } = props;
  const { t } = useBlockTranslation(props);
  const resolvedTitle = title || t('courseDefaultTitle');
  assertNamedObject(kids, ['chapters']);
  const chapters = (kids.chapters || []) as any[];

  // children are { type: 'block', id } objects from parseNode
  const [selectedChild, setSelectedChild] = useFieldState(props, fields.selectedChild,
    chapters[0]?.children[0]?.id || null);
  const [expandedChapter, setExpandedChapter] = useFieldState(props, fields.expandedChapter,
    chapters[0]?.id || null);
  const [navCollapsed, setNavCollapsed] = useFieldState(props, fields.navCollapsed, false);

  const handleChapterClick = (chapterId) => {
    setExpandedChapter(expandedChapter === chapterId ? null : chapterId);
  };

  const handleChildClick = (childId) => {
    setSelectedChild(childId);
  };

  // Check if selectedChild is valid (exists in any chapter's children)
  let hasValidSelection = false;
  for (const chapter of chapters) {
    if (chapter.children.find(child => child.id === selectedChild)) {
      hasValidSelection = true;
      break;
    }
  }

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
        label={t('courseNavigationLabel')}
        className="course-navigation"
      >
        <div>
          <h1>{resolvedTitle}</h1>
        </div>

        <div>
          {chapters.map((chapter) => (
            <div key={chapter.id}>
              {/* Chapter Header */}
              <button
                onClick={() => handleChapterClick(chapter.id)}
              >
                <div>
                  <span>{chapter.title}</span>
                  <ExpandIcon expanded={expandedChapter === chapter.id} />
                </div>
              </button>

              {/* Chapter Children */}
              {expandedChapter === chapter.id && (
                <div>
                  {chapter.children.map((child) => {
                    // child is { type: 'block', id }, look up full entry from Redux
                    const childId = child.id;
                    const childEntry = getBlockByOLXId(props, childId);
                    const title = childEntry?.attributes?.title || childEntry?.tag || childId;
                    return (
                      <button
                        key={childId}
                        onClick={() => handleChildClick(childId)}
                        className={selectedChild === childId ? 'selected' : ''}
                      >
                        {title}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </ResizableSidebar>

      {/* Right Content Area */}
      <div className="course-content">
        {hasValidSelection && selectedChild ? (
          <CourseContent props={props} selectedChild={selectedChild} />
        ) : (
          <div>
            <p>{t('courseSelectSectionPrompt')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default _Course;
