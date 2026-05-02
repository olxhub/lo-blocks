// src/lib/lofs/fileTypes.ts
//
// File type constants - enum definitions for Learning Observer content formats.
//
// Defines standardized file type constants used by the storage and parsing layers.
// Currently supports core formats (xml, olx, md) with plans to expand for
// PEG grammars and additional content types. This is just an enum definition,
// not detection logic.
//
import { enumdict } from '../util';

// String constants for common file extensions.
// For the proper content-type union, use ContentType from @/lib/util/fileTypes.
const _fileTypes = ['xml', 'olx', 'md'] as const;
export const fileTypes = enumdict(_fileTypes);
