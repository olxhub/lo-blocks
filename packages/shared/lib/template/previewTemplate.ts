// packages/shared/lib/template/previewTemplate.ts
//
// Shared logic for injecting content into preview templates.
// Used by both PEGPreviewPane and tests.
//

const CONTENT_PLACEHOLDER = '{{CONTENT}}';

/**
 * Injects content into a preview template.
 *
 * @param {string} template - The preview template with {{CONTENT}} placeholder
 * @param {string} content - The content to inject
 * @returns {{ olx: string } | { error: string }} - Result with either OLX or error
 */
export function injectPreviewContent(template: string, content: string): { olx: string } | { error: string } {
  if (!template) {
    return { error: 'No template provided' };
  }

  if (!template.includes(CONTENT_PLACEHOLDER)) {
    return { error: `Template is missing ${CONTENT_PLACEHOLDER} placeholder` };
  }

  let safe = content || '';
  // If the placeholder sits inside a CDATA section, escape any ]]> in the
  // content so it doesn't prematurely close the surrounding CDATA.
  if (template.includes('<![CDATA[' + CONTENT_PLACEHOLDER + ']]>')) {
    safe = safe.replaceAll(']]>', ']]]]><![CDATA[>');
  }
  return { olx: template.replace(CONTENT_PLACEHOLDER, safe) };
}

/**
 * Check if a template has the content placeholder.
 *
 * @param {string} template - The template to check
 * @returns {boolean}
 */
export function hasContentPlaceholder(template) {
  return template?.includes(CONTENT_PLACEHOLDER) ?? false;
}

/**
 * The placeholder string used in preview templates.
 */
export { CONTENT_PLACEHOLDER };
