import * as tp from './_templateParser.js'; // Your generated parser

export const compile = tp.parse;

export function extractPlaceholders(ast) {
  const set = new Set();
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
