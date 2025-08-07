// src/components/blocks/Course/Course.jsx
/*
  Course Block (Dev)

  Hierarchical course structure with chapters:
  - <Chapter title="..." id="..."> contains child blocks
  - Renders accordion navigation on left, selected content on right
  - Maintains expandedChapter state but doesn't auto-switch children

  XML structure:
  <Course title="My Course">
    <Chapter title="Getting Started" id="ch1">
      <Sequential>...</Sequential>
      <Problem>...</Problem>
    </Chapter>
    <Chapter title="Advanced Topics" id="ch2">
      <Vertical>...</Vertical>
    </Chapter>
  </Course>
*/

import { dev } from '@/lib/blocks';
import { childParser } from '@/lib/content/parsers';
import * as state from '@/lib/state';
import _Course from './_Course';

export const fields = state.fields(['selectedChild', 'expandedChapter']);

// === Custom parser to build chapter structure ===
const courseParser = childParser(async function courseBlockParser({ rawKids, parseNode }) {
  const chapters = [];

  for (const child of rawKids) {
    const tag = Object.keys(child).find(k => ![':@', '#text', '#comment'].includes(k));
    if (!tag) continue;

    if (tag === 'Chapter') {
      const chapterData = child[tag];
      const chapterAttributes = child[':@'] || {};
      
      // Extract chapter info
      const chapter = {
        id: chapterAttributes.id || `chapter_${chapters.length}`,
        title: chapterAttributes.title || 'Untitled Chapter',
        children: []
      };

      // Parse chapter children
      const chapterChildren = Array.isArray(chapterData) ? chapterData : [chapterData];
      for (const chapterChild of chapterChildren) {
        if (chapterChild && typeof chapterChild === 'object') {
          const parsed = await parseNode(chapterChild);
          if (parsed) {
            chapter.children.push(parsed);
          }
        }
      }

      chapters.push(chapter);
    } else {
      console.warn(`[Course] Unknown tag: <${tag}> (expected <Chapter>)`);
    }
  }

  return { chapters };
});

courseParser.staticKids = entry => {
  const allChildren = [];
  for (const chapter of entry.kids.chapters || []) {
    for (const child of chapter.children || []) {
      if (child && child.id) {
        allChildren.push(child.id);
      }
    }
  }
  return allChildren;
};

const Course = dev({
  ...courseParser(),
  name: 'Course',
  description: 'Hierarchical course structure with chapter navigation and content display',
  component: _Course,
  fields
});

export default Course;