// chatUtils.js -- Demo & Spec for clip/conversation navigation
// ------------------------------------------------------------
// This file demonstrates the usage and behaviors of core
// chatUtils functions for slicing/locating ranges in a
// parsed conversational scenario AST.
//
// To run these examples, just `node chatUtils.js` in a project
// with your chatUtils utilities imported.
//
// The goal is to document behaviors for content authors and
// future devs: what the clip DSL accepts, how boundaries work,
// what happens with titles, IDs, numbers, and errors.
//
// (If using vitest or jest, you could easily adapt to their format.)

import {
  byId,
  listSections,
  listIds,
  section,
  clip
} from './chatUtils.js';

const conversation = {
  body: [
    { type: "Line", speaker: "Annie", metadata: { id: "intro_start" }, text: "Hey!" },
    { type: "Line", speaker: "JJ", metadata: {}, text: "Welcome!" },
    { type: "SectionHeader", title: "Argument", metadata: {} },
    { type: "Line", speaker: "JJ", metadata: {}, text: "Awwww..." },
    { type: "SectionHeader", title: "Debrief", metadata: { id: "outro" } },
    { type: "Line", speaker: "Annie", metadata: {}, text: "Goodbye!" }
  ]
};

console.log('\n--- byId() ---');
console.log('byId(conversation, "intro_start"):', byId(conversation, "intro_start")); // 0
console.log('byId(conversation, "outro"):', byId(conversation, "outro")); // 4
console.log('byId(conversation, "no_such_id"):', byId(conversation, "no_such_id")); // false

console.log('\n--- listSections() ---');
console.log('listSections(conversation):');
listSections(conversation).forEach(sec =>
  console.log(`  - "${sec.title}" at index ${conversation.body.indexOf(sec)}`)
);

console.log('\n--- listIds() ---');
console.log('listIds(conversation):', listIds(conversation)); // [ 'intro_start', 'outro' ]

console.log('\n--- section() ---');
console.log('section(conversation, "Argument"):', section(conversation, "Argument"));
// { start: 2, end: 3 }
console.log('section(conversation, "Debrief"):', section(conversation, "Debrief"));
// { start: 4, end: 5 }
console.log('section(conversation, "NoSuchSection"):', section(conversation, "NoSuchSection"));
// null

console.log('\n--- clip() DEMOS ---');
function showClip(input) {
  const result = clip(conversation, input);
  console.log(`clip(conversation, ${JSON.stringify(input)}):`, result);
}
showClip("(0,3]");
showClip("[0,3)");
showClip("[0,3]");
showClip("[,3]");            // Omitted start
showClip("[3,]");            // Omitted end
showClip("[3,)");            // Omitted end
showClip("[,]");             // Both omitted: full range
showClip('"Argument"');      // Section by title
showClip("Argument");        // Section by bare title
showClip('[0,"Argument"]');  // Index to section
showClip('["Argument",5]');  // Section to index
showClip('["Argument","Debrief"]'); // Section to section
showClip("intro_start");     // By ID
showClip("[intro_start, 4]"); // ID to index
showClip("[no_such_id,]");   // Unresolvable ID
showClip("NoSuchSection");   // Unresolvable section

// Documenting corner cases:
console.log('\n--- Corner Cases ---');
console.log(
  'If a section, ID, and number all overlap (e.g., section "0", id="0", and line 0):\n' +
  '- clip("0") will be interpreted as section "0" if present, then ID, then index.'
);

// Output includes valid/invalid flags and descriptive messages.

// (Optional) If using Vitest, you could do:
// import { describe, it, expect } from 'vitest';
// describe('clip', () => { ... });
