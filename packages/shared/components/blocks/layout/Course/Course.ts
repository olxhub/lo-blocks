// packages/shared/components/blocks/layout/Course/Course.ts
/*
  Course Block (Dev)

  Hierarchical course structure with chapters and/or loose blocks:
  - <Chapter title="..." id="..."> contains child blocks (rendered with accordion nav)
  - Direct child blocks outside of Chapter are rendered as flat nav items
  - Renders accordion navigation on left, selected content on right
  - Maintains expandedChapter state but doesn't auto-switch children

  XML structure:
  <Course title="My Course">
    <Markdown id="intro" title="Introduction">Welcome!</Markdown>
    <Chapter title="Getting Started" id="ch1">
      <Sequential>...</Sequential>
      <Problem>...</Problem>
    </Chapter>
    <Chapter title="Advanced Topics" id="ch2">
      <Vertical>...</Vertical>
    </Chapter>
    <Markdown id="conclusion" title="Wrap-up">Done!</Markdown>
  </Course>
*/

import { dev } from '@/lib/blocks';
import { childParser } from '@/lib/content/parsers';
import * as state from '@/lib/state';

export const fields = state.fields([
  { name: 'selectedChild', url: true, urlDefault: true },
  'expandedChapter',
  'navCollapsed',
]);

// === Custom parser to build sections structure ===
const courseParser = childParser(async function courseBlockParser({ rawKids, parseNode }) {
  const sections: any[] = [];

  for (const child of rawKids) {
    const tag = Object.keys(child).find(k => ![':@', '#text', '#comment'].includes(k));
    if (!tag) continue;

    if (tag === 'Chapter') {
      const chapterData = child[tag];
      const chapterAttributes = child[':@'] || {};

      // Extract chapter info
      const chapter: { type: string; id: any; title: any; children: any[] } = {
        type: 'chapter',
        id: chapterAttributes.id || `chapter_${sections.length}`,
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

      sections.push(chapter);
    } else {
      // Loose block: parse and add directly as a block entry
      const parsed = await parseNode(child);
      if (parsed) {
        sections.push({ ...parsed, type: 'block' });
      }
    }
  }

  return { sections };
});

courseParser.staticKids = entry => {
  const allChildren: any[] = [];
  for (const section of entry.kids.sections || []) {
    if (section.type === 'chapter') {
      for (const child of section.children || []) {
        if (child && child.id) {
          allChildren.push(child.id);
        }
      }
    } else if (section.type === 'block' && section.id) {
      allChildren.push(section.id);
    }
  }
  return allChildren;
};

const Course = dev({
  ...courseParser(),
  name: 'Course',
  description: 'Hierarchical course structure with chapter navigation and content display',
  fields,
});

export default Course;
