// A record that names a directory on THIS machine.
//
// Ported from `enforcement.check_records_carry_no_machine_path` (goal K).
//
// AN ABSOLUTE PATH IN A RECORD IS PINNED TO ONE DISK, and worse, to one DAY's
// layout. Measured 2026-09-26: `PROBED.json` held fifteen paths under a data
// root that had moved that morning, every one broken, and nothing reported it
// -- the file still parsed, the fields were still strings, and a reader that
// could not find an artifact simply found none. That is this project's
// signature failure: an empty result reading as a clean one.
//
// THE FIX IS A ROOT TOKEN, not a tidier absolute path. `{rubric}/...` and
// `{instrument}/...` name the OWNER and let each side resolve, so the record
// survives a move and travels to another machine.
//
// IT SCANS VALUES, NOT PROSE. A path inside a `why` or a `note` is a QUOTATION
// -- the declarations quote paths when explaining an incident -- and rewriting
// those would make the explanation describe something that never happened.

export type MachinePathPayload = {
  /** One entry per record: its label and its parsed contents. */
  records: Array<{ label: string; doc: unknown }>;
};

const PROSE = new Set(['why', 'note', 'reason', 'detail', 'text', 'desc', 'rule',
                       'feedback', 'comment', 'prose', 'message']);
const ROOTS = ['/home/', '/Users/', '/tmp/', '/var/', '/opt/'];

function walk(node: unknown, path: string, out: Array<[string, string]>): void {
  if (Array.isArray(node)) {
    node.forEach((v, n) => walk(v, `${path}[${n}]`, out));
  } else if (node !== null && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (PROSE.has(String(k))) continue;      // a quotation, not a location
      walk(v, `${path}.${k}`, out);
    }
  } else if (typeof node === 'string'
             && ROOTS.some(r => node.startsWith(r)) && node.length > 8) {
    out.push([path, node]);
  }
}

export function recordsCarryNoMachinePath(p: MachinePathPayload): string[] {
  const out: string[] = [];
  for (const rec of p?.records ?? []) {
    const hits: Array<[string, string]> = [];
    walk(rec.doc, rec.label, hits);
    for (const [where, value] of hits) {
      out.push(
        `${where} carries ${pyRepr(value)} -- a record must not name a ` +
        `directory on one machine. Write \`{rubric}/...\` or ` +
        `\`{instrument}/...\` and resolve it with paths.record_path; ` +
        `an absolute path here goes stale the next time a root moves, ` +
        `and a reader that cannot find the file reports nothing.`);
    }
  }
  return out;
}

/** Python's `repr()` for the strings these records hold. */
function pyRepr(s: string): string {
  const body = s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
  if (body.includes("'") && !body.includes('"')) return `"${body}"`;
  return `'${body.replace(/'/g, "\\'")}'`;
}
