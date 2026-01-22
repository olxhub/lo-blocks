// s../lib/lofs/fileTypes.ts
//
// File type constants - enum definitions for Learning Observer content formats.
//
// Defines standardized file type constants used by the storage and parsing layers.
// Currently supports core formats (xml, olx, md) with plans to expand for
// PEG grammars and additional content types. This is just an enum definition,
// not detection logic.
//
import { enumdict } from '../util';

// TODO: Expand to include:
// import pegExts from '../../generated/pegExtensions.json' assert { type: 'json' };

// TODO: Find a way to manage additional data, such as which parser does syntax checking,
// info on syntax highlighting, etc. for use in CodeMirror

const _fileTypes = ['xml', 'olx', 'md'] as const;
export const fileTypes = enumdict(_fileTypes);
export type FileType = (typeof _fileTypes)[number] | string;
