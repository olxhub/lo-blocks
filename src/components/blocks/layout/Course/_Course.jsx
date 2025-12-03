// src/components/blocks/Course/_Course.jsx
'use client';

import React from 'react';
import { useReduxState } from '@/lib/state';
import { render } from '@/lib/render';

function _Course(props) {
  const { kids = {}, fields, title = 'Course' } = props;
  const { chapters = [] } = kids;

  // children are { type: 'block', id } objects from parseNode
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
  // chapter.children are { type: 'block', id } objects, so we match by id
  let selectedChildNode = null;
  for (const chapter of chapters) {
    const found = chapter.children.find(child => child.id === selectedChild);
    if (found) {
      selectedChildNode = props.idMap?.[selectedChild];
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
                  {chapter.children.map((child) => {
                    // child is { type: 'block', id }, look up full entry from idMap
                    const childId = child.id;
                    const childEntry = props.idMap?.[childId];
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