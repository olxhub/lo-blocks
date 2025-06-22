// src/lib/storage/fileTypes.ts
import { enumdict } from '../util';
const _fileTypes = ['xml', 'olx', 'md'] as const;
export const fileTypes = enumdict(_fileTypes) as const;
export type FileType = (typeof _fileTypes)[number] | string;
