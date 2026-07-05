// packages/shared/components/blocks/authoring/Studio/fileNames.ts
//
// Filename sanitization shared by the Files panel (rename input) and the
// new-file dialog. Was duplicated verbatim in the two legacy files.

import { FORBIDDEN_FILENAME_CHARS } from '@/lib/types/storage';

/** Strip characters that are not allowed in filenames. */
export function sanitizeFileName(input: string): string {
  return input
    .replace(FORBIDDEN_FILENAME_CHARS, '')
    .replace(/(^|\/)\.+/g, '$1');  // strip leading dots per segment
}
