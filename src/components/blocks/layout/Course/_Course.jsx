// src/components/blocks/Course/_Course.jsx
'use client';

import React from 'react';
import { useReduxState } from '@/lib/state';
import { render } from '@/lib/render';

function _Course(props) {
  const { kids = {}, fields, title = 'Course', ...otherProps } = props;
  const { chapters = [] } = kids;

  const [selectedChild, setSelectedChild] = useReduxState(props, fields.selectedChild,
    chapters[0]?.children[0]?.id || null);
  const [expandedChapter, setExpandedChapter] = useReduxState(props, fields.expandedChapter,
    chapters[0]?.id || null);

  const handleChapterClick = (chapterId) => {
    setExpandedChapter(expandedChapter === chapterId ? null : chapterId);
  };

  const handleChildClick = (childId) => {
    setSelectedChild(childId);
  };

  // Find the currently selected child to render
  let selectedChildNode = null;
  for (const chapter of chapters) {
    const found = chapter.children.find(child => child.id === selectedChild);
    if (found) {
      selectedChildNode = found;
      break;
    }
  }

  return (
    <div className="course-container">
      {/* Left Navigation Accordion */}
      <div className="course-navigation">
        <div>
          <h1>{title}</h1>
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
                  <span>
                    {expandedChapter === chapter.id ? '▼' : '▶'}
                  </span>
                </div>
              </button>

              {/* Chapter Children */}
              {expandedChapter === chapter.id && (
                <div>
                  {chapter.children.map((child) => (
                    <button
                      key={child.id}
                      onClick={() => handleChildClick(child.id)}
                      className={selectedChild === child.id ? 'selected' : ''}
                    >
                      {child.attributes?.title || child.tag || child.id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right Content Area */}
      <div className="course-content">
        {selectedChildNode ? (
          <div>
            {render({
              node: selectedChildNode,
              idMap: props.idMap,
              nodeInfo: props.nodeInfo,
              componentMap: props.componentMap,
              idPrefix: props.idPrefix
            })}
          </div>
        ) : (
          <div>
            <p>Select a section from the navigation to begin.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default _Course;