// src/components/blocks/Course/_Course.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

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

// Compute the first selectable ID from sections
function firstSelectableId(sections: any[]): string | null {
  for (const section of sections) {
    if (section.type === 'block' && section.id) return section.id;
    if (section.type === 'chapter' && section.children?.[0]?.id) return section.children[0].id;
  }
  return null;
}

// Find the first chapter ID
function firstChapterId(sections: any[]): string | null {
  for (const section of sections) {
    if (section.type === 'chapter') return section.id;
  }
  return null;
}

function _Course(props: RuntimeProps) {
  const { kids, fields, title } = props;
  const { t } = useBlockTranslation(props);
  const resolvedTitle = title || t('defaultCourseTitle');
  assertNamedObject(kids, ['sections']);
  const sections = (kids.sections || []) as any[];

  const [selectedChild, setSelectedChild] = useFieldState(props, fields.selectedChild,
    firstSelectableId(sections));
  const [expandedChapter, setExpandedChapter] = useFieldState(props, fields.expandedChapter,
    firstChapterId(sections));
  const [navCollapsed, setNavCollapsed] = useFieldState(props, fields.navCollapsed, false);

  const handleChapterClick = (chapterId) => {
    setExpandedChapter(expandedChapter === chapterId ? null : chapterId);
  };

  const handleChildClick = (childId) => {
    setSelectedChild(childId);
  };

  // Check if selectedChild is valid (exists in any chapter's children or as a loose block)
  let hasValidSelection = false;
  for (const section of sections) {
    if (section.type === 'block' && section.id === selectedChild) {
      hasValidSelection = true;
      break;
    }
    if (section.type === 'chapter' && section.children.find(child => child.id === selectedChild)) {
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
        label={t('courseNavigation')}
        className="course-navigation"
      >
        <div>
          <h1>{resolvedTitle}</h1>
        </div>

        <div>
          {sections.map((section) => {
            if (section.type === 'chapter') {
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
                      {section.children.map((child) => {
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

            // Loose block at top level
            const blockId = section.id;
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

export default _Course;
