// packages/shared/lib/stateLanguage/methods.ts
//
// The expression language's member vocabulary: every property that can be
// read, and every method that can be called, on a value inside an
// expression.
//
// WHY THIS EXISTS
// ---------------
// The evaluator used to implement `obj.prop` and `obj.method(...)` by
// reaching into the underlying JavaScript value: `obj[name]`, and for calls
// `obj[name].apply(obj, args)`. That made the expression language a thin
// veneer over JavaScript — every function-valued property of every value was
// reachable, including the prototype chain, so
//
//     "x".constructor.constructor("return 1")()
//
// parsed, evaluated, and ran arbitrary JavaScript. It also broke the
// abstraction: the language silently inherited whatever the JS runtime (or a
// library's object) happened to expose, rather than a vocabulary we chose.
//
// The language owns its vocabulary. Everything an expression can reach on a
// value is listed below, keyed by receiver kind, and every entry is a
// function WE provide (most are one-liners delegating to the JS built-in).
// No other property is reachable: not by member access, not by a method
// call, not through a sigil field chain.
//
// Plain objects are the one open kind: `obj.key`, and `c.done` inside an
// arrow over a caller-provided list, read OWN ENUMERABLE keys only, never
// anything inherited. Blocks and content put arbitrary keys in those
// buckets, so an allowlist there would be a list of every field name in
// every block.
//
// WHAT CONTENT USED WHEN THIS WAS WRITTEN (2026-09, audit over every
// expression in packages/shared/components/**.olx, edu.memphis.writing,
// edu.memphis.psych, edu.mtsu.transitional-reading — when=/watch=/match=/
// initial=/reference= attributes, {{ }} interpolations, chatpeg
// `--- wait … ---` lines — plus evaluate.test.ts, syntax.test.ts and
// syntax.md; 965 expressions parsed):
//
//   receiver kind   name          uses   example
//   ─────────────── ───────────── ────── ───────────────────────────────────
//   object          correct        103   @branch_problem.correct === correctness.correct
//   object          done            15   completion.done
//   array/string    length          10   @wj1_why_top2.value.length < 1
//   array           every           10   items.every(c => c.completion === completion.done)
//   array           filter          10   items.filter(c => c.correct === correctness.correct).length
//   Math            round            8   Math.round(@score.value * 100)
//   object          incorrect        6   @seq_check.correct === correctness.incorrect
//   Object          keys             6   Object.keys(@wj1_board_school.value).length >= 1
//   array           some             6   items.some(c => c.correct === correctness.correct)
//   Math            floor            4   Math.floor(@score.value * 10)
//   array           map              4   items.map(c => c.value)
//   array/string    includes         9   @tmf_be_connect.value.includes('american_independence')
//   array           join             3   items.map(c => c.value).join(", ")
//   array           find             2   items.find(c => c.id === @current).value
//   Math            ceil/min/max     6   Math.ceil(@progress), Math.min(@a, @b)
//   object          notStarted, inProgress, skipped, closed, partiallyCorrect,
//                   unsubmitted, submitted, incomplete, invalid, completion,
//                   id, value, score, …    (bucket/constant keys — own-key reads)
//
// Nothing else appeared. `map`/`find` were already in ACTIVE_METHODS and are
// documented in syntax.md, so they stay active even where content hasn't
// reached for them yet.
//
// ADDING TO THE LANGUAGE
// ----------------------
// Add the entry here — nowhere else. Names under a value kind (array,
// string, number, boolean) are re-exported as ACTIVE_METHODS by keywords.ts
// and so become reserved block field/attribute names automatically; that is
// the point of deriving them from one table. Names under a NAMESPACE
// (Math, Object) are scoped by the namespace identifier, which is itself
// reserved, so they are deliberately NOT reserved as field names — blocks
// legitimately have fields called `min`, `max` or `round`.

/**
 * Names that are refused everywhere, on every receiver kind, regardless of
 * what any table says. Reading them is how a JS escape starts.
 */
export const FORBIDDEN_PROPERTIES: ReadonlySet<string> = new Set([
  'constructor',
  '__proto__',
  'prototype',
]);

/** Receiver kinds with a fixed vocabulary (everything but plain objects). */
export type ValueKind = 'array' | 'string' | 'number' | 'boolean';

/** Every kind the evaluator can dispatch on. */
export type ReceiverKind = ValueKind | 'object' | 'namespace' | 'function';

/**
 * One receiver kind's vocabulary. `properties` are read with `.name`;
 * `methods` are called with `.name(...)`. Both are OUR functions: the
 * receiver arrives as the first argument, so nothing is ever `.apply`d to a
 * value we didn't choose.
 */
export interface MemberTable {
  readonly properties: Record<string, (receiver: any) => any>;
  readonly methods: Record<string, (receiver: any, ...args: any[]) => any>;
}

function own(table: Record<string, unknown>, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(table, name);
}

/**
 * Arrow-function arguments arrive as one-parameter callables built by the
 * evaluator (ArrowFunction nodes). We call them with the element only — the
 * language never promised index/array parameters, so we don't pass them.
 */
function callback(fn: unknown, method: string): (item: any) => any {
  if (typeof fn !== 'function') {
    throw new Error(`${method}() needs a function argument, e.g. ${method}(x => x.done)`);
  }
  return (item: any) => (fn as (item: any) => any)(item);
}

// ─── Arrays ────────────────────────────────────────────────────────────

const ARRAY_MEMBERS: MemberTable = {
  properties: {
    length: (arr: any[]) => arr.length,
  },
  methods: {
    every: (arr: any[], fn: unknown) => arr.every(callback(fn, 'every')),
    some: (arr: any[], fn: unknown) => arr.some(callback(fn, 'some')),
    filter: (arr: any[], fn: unknown) => arr.filter(callback(fn, 'filter')),
    map: (arr: any[], fn: unknown) => arr.map(callback(fn, 'map')),
    find: (arr: any[], fn: unknown) => arr.find(callback(fn, 'find')),
    includes: (arr: any[], item: any) => arr.includes(item),
    join: (arr: any[], separator?: any) =>
      arr.join(separator === undefined ? ',' : String(separator)),
  },
};

// ─── Strings ───────────────────────────────────────────────────────────

const STRING_MEMBERS: MemberTable = {
  properties: {
    length: (str: string) => str.length,
  },
  methods: {
    includes: (str: string, needle: any) => str.includes(String(needle)),
  },
};

// ─── Numbers and booleans ──────────────────────────────────────────────
//
// No members today. They are listed so the error message can name the kind
// ("numbers have no member 'toFixed'") rather than falling through to a
// generic failure.

const NUMBER_MEMBERS: MemberTable = { properties: {}, methods: {} };
const BOOLEAN_MEMBERS: MemberTable = { properties: {}, methods: {} };

const VALUE_TABLES: Record<ValueKind, MemberTable> = {
  array: ARRAY_MEMBERS,
  string: STRING_MEMBERS,
  number: NUMBER_MEMBERS,
  boolean: BOOLEAN_MEMBERS,
};

// ─── Namespaces (Math, Object) ─────────────────────────────────────────
//
// `Math` and `Object` in an expression used to evaluate to the real JS
// globals, which made `Math.constructor` and `Object.getPrototypeOf` part of
// the language by accident. They now evaluate to opaque sentinels that carry
// only a name; the sentinel's vocabulary is the table below.

const NAMESPACE_BRAND = Symbol('stateLanguage.namespace');

export interface NamespaceValue {
  readonly [NAMESPACE_BRAND]: string;
}

const NAMESPACE_TABLES: Record<string, MemberTable> = {
  Math: {
    properties: {},
    methods: {
      round: (_ns: unknown, x: any) => Math.round(x),
      floor: (_ns: unknown, x: any) => Math.floor(x),
      ceil: (_ns: unknown, x: any) => Math.ceil(x),
      abs: (_ns: unknown, x: any) => Math.abs(x),
      min: (_ns: unknown, ...xs: any[]) => Math.min(...xs),
      max: (_ns: unknown, ...xs: any[]) => Math.max(...xs),
      sqrt: (_ns: unknown, x: any) => Math.sqrt(x),
      pow: (_ns: unknown, base: any, exp: any) => Math.pow(base, exp),
    },
  },
  // Object.keys() survives from older content. Prefer isFilled(@value) in
  // new content — it handles objects, arrays and strings.
  Object: {
    properties: {},
    methods: {
      keys: (_ns: unknown, obj: any) => (obj == null ? [] : Object.keys(obj)),
      values: (_ns: unknown, obj: any) => (obj == null ? [] : Object.values(obj)),
      entries: (_ns: unknown, obj: any) => (obj == null ? [] : Object.entries(obj)),
    },
  },
};

function makeNamespace(name: string): NamespaceValue {
  const ns = Object.create(null) as { [NAMESPACE_BRAND]: string };
  ns[NAMESPACE_BRAND] = name;
  return Object.freeze(ns);
}

/** The namespace identifiers the evaluator binds: `Math`, `Object`. */
export const NAMESPACE_VALUES: Record<string, NamespaceValue> = Object.fromEntries(
  Object.keys(NAMESPACE_TABLES).map(name => [name, makeNamespace(name)])
);

function namespaceName(value: any): string | null {
  if (value == null || typeof value !== 'object') return null;
  const name = (value as any)[NAMESPACE_BRAND];
  return typeof name === 'string' ? name : null;
}

// ─── Active names (keywords.ts derives ACTIVE_METHODS from these) ──────

function namesOf(table: MemberTable): string[] {
  return [...Object.keys(table.properties), ...Object.keys(table.methods)];
}

/**
 * Every member name the language resolves on a VALUE (array, string,
 * number, boolean). These are the names that would otherwise be ambiguous
 * with a block's field names, so keywords.ts reserves them.
 *
 * Namespace members (Math.round, Object.keys) are deliberately excluded:
 * they are only reachable through the namespace identifier, which is
 * reserved on its own.
 */
export const ACTIVE_MEMBER_NAMES: ReadonlySet<string> = new Set(
  (Object.keys(VALUE_TABLES) as ValueKind[]).flatMap(kind => namesOf(VALUE_TABLES[kind]))
);

/** The subset of ACTIVE_MEMBER_NAMES that are callable methods. */
export const ACTIVE_METHOD_NAMES: ReadonlySet<string> = new Set(
  (Object.keys(VALUE_TABLES) as ValueKind[]).flatMap(kind => Object.keys(VALUE_TABLES[kind].methods))
);

// ─── Dispatch ──────────────────────────────────────────────────────────

/** Classify a receiver. Null/undefined never reach here. */
export function receiverKind(value: any): ReceiverKind {
  if (Array.isArray(value)) return 'array';
  if (namespaceName(value) !== null) return 'namespace';
  switch (typeof value) {
    case 'string': return 'string';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'function': return 'function';
    default: return 'object';
  }
}

/** Human-readable receiver name for error messages. */
function describe(value: any): string {
  const kind = receiverKind(value);
  if (kind === 'namespace') return `the ${namespaceName(value)} namespace`;
  switch (kind) {
    case 'array': return 'arrays';
    case 'string': return 'strings';
    case 'number': return 'numbers';
    case 'boolean': return 'booleans';
    case 'function': return 'functions';
    default: return 'objects';
  }
}

function tableFor(value: any): MemberTable | null {
  const kind = receiverKind(value);
  if (kind === 'namespace') return NAMESPACE_TABLES[namespaceName(value)!] ?? null;
  if (kind === 'object' || kind === 'function') return null;
  return VALUE_TABLES[kind];
}

function assertAllowedName(name: string): void {
  if (FORBIDDEN_PROPERTIES.has(name)) {
    throw new Error(`'${name}' is not readable in expressions`);
  }
}

/** Own ENUMERABLE key, never an inherited one. */
function ownEnumerable(obj: any, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, name) &&
         Object.prototype.propertyIsEnumerable.call(obj, name);
}

/**
 * Read `receiver.name`.
 *
 * Plain objects (block state buckets, `correctness`/`completion`, object
 * literals, items of a caller-provided list) answer with their own
 * enumerable keys, and `undefined` for anything else — an absent field has
 * always read as undefined and content relies on it.
 *
 * Every other kind has a fixed vocabulary: an unknown name is an error,
 * because on those kinds a dynamic property read is exactly the JS escape
 * hatch this table exists to close.
 */
export function readMember(receiver: any, name: string): any {
  assertAllowedName(name);
  if (receiver == null) return undefined;

  const table = tableFor(receiver);
  if (!table) {
    if (typeof receiver === 'function') {
      throw new Error(`Cannot read '${name}': functions have no properties in expressions`);
    }
    return ownEnumerable(receiver, name) ? receiver[name] : undefined;
  }

  if (own(table.properties, name)) return table.properties[name](receiver);
  if (own(table.methods, name)) {
    throw new Error(
      `'${name}' is a method of ${describe(receiver)}; it has to be called: ${name}(...)`
    );
  }
  throw new Error(`Unknown property '${name}' on ${describe(receiver)}`);
}

/**
 * Call `receiver.name(...args)`.
 *
 * The method is always one of ours from the table above — a value's own
 * function-valued properties are never callable.
 */
export function callMember(receiver: any, name: string, args: any[]): any {
  assertAllowedName(name);
  if (receiver == null) {
    throw new Error(`Cannot call '${name}' on null/undefined`);
  }

  const table = tableFor(receiver);
  if (!table) {
    throw new Error(
      `Unknown method '${name}': ${describe(receiver)} have no methods in the expression language`
    );
  }

  if (own(table.methods, name)) return table.methods[name](receiver, ...args);
  if (own(table.properties, name)) {
    throw new Error(`'${name}' is a property of ${describe(receiver)}, not a method`);
  }
  throw new Error(`Unknown method '${name}' on ${describe(receiver)}`);
}

/**
 * Is `name` a method of some value kind? The PEG grammar folds
 * `@foo.value.includes` into one SigilRef, so the evaluator needs to know
 * where the field chain ends and the method begins before it has a value.
 */
export function isValueMethodName(name: string): boolean {
  return ACTIVE_METHOD_NAMES.has(name);
}
