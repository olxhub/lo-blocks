// src/lib/content/xmlTransforms.jsx
//
// XML tag transformations - preprocessing layer for OLX parsing.
//
// Handles tag name transformations during XML parsing to support:
// - Mathematical notation shortcuts ($ → InlineMath, $$ → BlockMath)
// - Legacy OLX 1.0 compatibility mappings
// - HTML tag recognition and passthrough
// - CAPA response type mapping to modern grader names
//
// The transform system allows Learning Observer to accept content in multiple
// formats while normalizing to a consistent internal representation. This is
// particularly important for migrating content from edX and other platforms.
//
// From https://www.w3schools.com/tags/ union https://developer.mozilla.org/en-Latn-US/docs/Web/HTML/Reference/Elements
const html_tags = ['a', 'abbr', 'acronym', 'address', 'applet', 'area', 'article', 'aside', 'audio', 'b', 'base', 'basefont', 'bdi', 'bdo', 'big', 'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'content', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'dir', 'div', 'dl', 'dt', 'em', 'embed', 'fencedframe', 'fieldset', 'figcaption', 'figure', 'font', 'footer', 'form', 'frame', 'frameset', 'h1 to h6', 'h1, h2, h3, h4, h5, h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'image', 'img', 'input', 'ins', 'kbd', 'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'marquee', 'math', 'menu', 'menuitem', 'meta', 'meter', 'nav', 'nobr', 'noembed', 'noframes', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p', 'param', 'picture', 'plaintext', 'pre', 'progress', 'q', 'rb', 'rp', 'rt', 'rtc', 'ruby', 's', 'samp', 'script', 'search', 'section', 'select', 'selectedcontent', 'shadow', 'slot', 'small', 'source', 'span', 'strike', 'strong', 'style', 'sub', 'summary', 'sup', 'svg', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'tt', 'u', 'ul', 'var', 'video', 'wbr', 'xmp'];

// Ad-hoc list of OLX1.0 tags
// These are via LLM, and may not be 100%
const olx_tags = [
  // Core course structure
  'course', 'chapter', 'sequential', 'vertical', 'html', 'problem', 'video', 'discussion', 'library_content', 'conditional', 'randomize', 'option', 'case', 'poll', 'survey', 'word_cloud',
  // Specialized blocks
  'drag_and_drop_v2', 'imageannotation', 'annotatableimage', 'openassessment', 'edx_sga', 'lti_consumer', 'xblock', // Generic wrapper
  // Content organization (non-course)
  'course_info', 'about', 'handouts', 'updates',
  // Experiments and personalization
  'split_test', 'content_experiment', 'content_library',
  // Publishing and textbooks
  'textbook', 'extractedtext',
  // Third-party XBlocks (common extras)
  'problem-builder', 'step-builder', 'mentoring', 'edx-ora2', 'edx-video', 'edx-notes',
  // Experimental / lesser known
  'external_link', 'wiki'
];

// OLX1.0 tags (inside of a problem)
// These are via LLM, and may not be 100%
const capa_inputtypes = [
  'textline',        // single-line text input
  'textarea',        // multi-line text input
  'math_expression', // math expressions evaluated
  'dropdown',        // dropdown selection
  'choicegroup',     // multiple choice (single select)
  'checkboxgroup',   // multiple choice (multi-select)
  'draggable',       // drag and drop input
  'imageinput',      // clicking on an image
  'fileupload'       // file upload input
];

// Mapping of legacy response tags to OLX2 grader names
const capaGraderMap = {
  'stringresponse': 'StringGrader',         // expects text matching
  'numericalresponse': 'NumericalGrader',   // expects a number or number range
  'formularesponse': 'FormulaGrader',       // math formula checking
  'symbolicresponse': 'SymbolicGrader',     // symbolic math (exact form)
  'multiplechoiceresponse': 'MultipleChoiceGrader', // old-school multiple choice
  'choiceresponse': 'ChoiceGrader',         // choice group (select one)
  'customresponse': 'CustomGrader',         // custom python-coded checking
  'optionresponse': 'OptionGrader',         // old version of multiple options
  'chemicalequationresponse': 'ChemicalEquationGrader', // chemistry equations
  'draggableresponse': 'DraggableGrader',   // graded drag-and-drop
  'tabularresponse': 'TabularGrader',       // table/grid-based response
};

export function composeTagNameTransforms(...transforms) {
  return function(tagName) {
    return transforms.reduce(
      (current, fn) => fn(current),
      tagName
    );
  };
}

export function mathShorthand(tagName) {
  if (tagName === '$') return 'InlineMath';
  if (tagName === '$$') return 'BlockMath';
  return tagName;
}

// TODO: Future transforms:
// - url_name → id (for importing Open edX OLX content)
// - i18n tag names (requested by Open edX partners to author in native languages,
//   e.g., <Sekwencja>, <Pytanie> for Polish)
// lo-blocks uses `id` as the canonical ID attribute.

// Default transforms
export const transformTagName = mathShorthand;
