// src/lib/template/template.js
//
// Template system - simple placeholder substitution using PEG grammar.
//
// Provides a lightweight templating system with {{placeholder}} syntax:
// - `compile`: Parse template strings into AST
// - `render`: Substitute values into compiled templates
// - `validate`: Check for missing or extra template variables
//
// Generic templating utility - used by Learning Observer content authoring
// among other applications that need parameterized text generation.
//
import * as tp from './_templateParser'; // Your generated parser

export const compile = tp.parse;

export function extractPlaceholders(ast): string[] {
  const set = new Set<string>();
  for (const node of ast) {
    if (node.type === "placeholder") set.add(node.name);
  }
  return Array.from(set);
}

export function render(ast, values) {
  return ast.map(node => {
    if (node.type === "text") return node.value;
    if (node.type === "placeholder") return values[node.name] ?? "";
  }).join('');
}

export function validate(ast, values) {
  const required = new Set(extractPlaceholders(ast));
  const supplied = new Set(Object.keys(values));
  const missing = [...required].filter(x => !supplied.has(x));
  const extra = [...supplied].filter(x => !required.has(x));
  return {
    valid: missing.length === 0 && extra.length === 0,
    missing,
    extra,
  };
}
