// src/lib/storage/fileTypes.ts
import { enumdict } from '../util';

// TODO: Expand to include:
// import pegExts from '../../generated/pegExtensions.json' assert { type: 'json' };

// TODO: Find a way to manage additional data, such as which parser does syntax checking,
// info on syntax highlighting, etc. for use in CodeMirror

const _fileTypes = ['xml', 'olx', 'md'] as const;
export const fileTypes = enumdict(_fileTypes);
export type FileType = (typeof _fileTypes)[number] | string;
