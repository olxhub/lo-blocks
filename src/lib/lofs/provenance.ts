// src/lib/lofs/provenance.ts
//
// Provenance utilities - tracking content source and location for debugging.
//
// Implements Learning Observer's provenance system using three related types:
// - ProvenanceURI: String format like "file:///path/to/content.xml"
// - ProvenanceStruct: Parsed object with {type, path, ...metadata}
// - ProvenanceEntry: Either URI string or struct object
// - Lists, which can contain either format and get converted as needed.
//
// The system tracks where content comes from through the parsing pipeline,
// enabling precise error reporting ("syntax error in mycourse/lesson1.xml:42"),
// content dependency tracking across storage providers, and authoring.
//
import { FileProvenance, GenericProvenance, ProvenanceStruct, ProvenanceURI, ProvenanceEntry } from '../types';

export function parseProvenance(uri: ProvenanceURI): ProvenanceStruct {
  const [type, suffix] = uri.split('://');
  if (!type || suffix === undefined) {
    throw new Error(`Invalid provenance URI: ${uri}`);
  }

  const converters: Record<string, (suf: string) => Record<string, any>> = {
    file: suf => {
      const [pathPart, queryPart] = suf.split('?');
      const result: Record<string, any> = {
        path: pathPart.startsWith('/') ? pathPart : `/${pathPart}`
      };
      if (queryPart) {
        const params = new URLSearchParams(queryPart);
        if (params.has('path')) {
          throw new Error(`Malformed file provenance: path duplicated in query`);
        }
        params.forEach((v, k) => {
          result[k] = v;
        });
      }
      return result;
    },
    // Inline OLX embedded directly (e.g., in RenderOLX component)
    'inline': suf => ({ path: suf || 'inline' }),
    // OLX embedded within markdown code blocks
    'markdown-embed': suf => ({ path: suf || 'markdown-embed' }),
  };

  if (!(type in converters)) {
    throw new Error(`Unknown provenance type: ${type}`);
  }

  return { type, ...converters[type](suffix) } as ProvenanceStruct;
}

export function parseProvenanceList(list: ProvenanceURI[]): ProvenanceStruct[] {
  return list.map(parseProvenance);
}

export function formatProvenance(item: ProvenanceEntry): ProvenanceURI {
  if (typeof item === 'string') return item;
  const converters: Record<string, (obj: any) => string> = {
    file: (obj: FileProvenance) => {
      const { path, type, ...rest } = obj;
      const query = new URLSearchParams(rest).toString();
      return `file://${path}${query ? `?${query}` : ''}`;
    },
    'inline': (obj: GenericProvenance) => `inline://${obj.path || ''}`,
    'markdown-embed': (obj: GenericProvenance) => `markdown-embed://${obj.path || ''}`,
  };

  const conv = converters[item.type];
  if (!conv) throw new Error(`Unknown provenance type: ${item.type}`);
  return conv(item) as ProvenanceURI;
}

export function formatProvenanceList(list: ProvenanceEntry[]): ProvenanceURI[] {
  return list.map(formatProvenance);
}
