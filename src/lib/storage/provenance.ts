// src/lib/storage/provenance.ts
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
    }
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
    }
  };

  const conv = converters[item.type];
  if (!conv) throw new Error(`Unknown provenance type: ${item.type}`);
  return conv(item);
}

export function formatProvenanceList(list: ProvenanceEntry[]): ProvenanceURI[] {
  return list.map(formatProvenance);
}
