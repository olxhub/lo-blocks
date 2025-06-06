export interface FileProvenance {
  type: 'file';
  uri: string;
  // Future: additional metadata like line numbers or git commit
}

export interface DatabaseProvenance {
  type: 'database';
  id: string;
  table?: string;
}

export interface GitProvenance {
  type: 'git';
  repo: string;
  path: string;
  commit?: string;
}

export type ProvenanceSource =
  | FileProvenance
  | DatabaseProvenance
  | GitProvenance
  | { type: string; [key: string]: any };

export type Provenance = ProvenanceSource[];

export function fileSource(uri: string): ProvenanceSource {
  return { type: 'file', uri };
}
