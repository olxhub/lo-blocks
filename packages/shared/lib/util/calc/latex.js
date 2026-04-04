/**
 * LaTeX string generation from AST nodes.
 * Port of calc/preview.py.
 */

import { SUFFIXES } from './functions.js';

export class LatexRendered {
  constructor(latex, { parens = null, tall = false } = {}) {
    this.latex = latex;
    this.sans_parens = latex;
    this.tall = tall;

    if (parens !== null) {
      let leftParens = parens;
      if (leftParens === '{') leftParens = '\\{';

      const pairs = { '(': ')', '[': ']', '\\{': '\\}' };
      if (!(leftParens in pairs)) {
        throw new Error(`Unknown parenthesis '${leftParens}': coder error`);
      }
      let rightParens = pairs[leftParens];

      if (this.tall) {
        leftParens = '\\left' + leftParens;
        rightParens = '\\right' + rightParens;
      }

      this.latex = leftParens + latex + rightParens;
    }
  }
}

const GREEK = new Set(
  ("alpha beta gamma delta epsilon varepsilon zeta eta theta " +
   "vartheta iota kappa lambda mu nu xi pi rho sigma tau upsilon " +
   "phi varphi chi psi omega").split(' ')
);
// Add capitals
for (const g of [...GREEK]) GREEK.add(g.charAt(0).toUpperCase() + g.slice(1));
// Add hbar and infty
GREEK.add('hbar');
GREEK.add('infty');

function enrichVarname(varname) {
  if (GREEK.has(varname)) return '\\' + varname;
  return varname.replace(/_/g, '\\_');
}

/**
 * Render an AST node to a LatexRendered object.
 */
export function renderLatex(node, context) {
  return renderNode(node, context);
}

function renderNode(node, ctx) {
  switch (node.type) {
    case 'number': return renderNumber(node);
    case 'variable': return renderVariable(node, ctx);
    case 'function': return renderFunction(node, ctx);
    case 'parens': return renderParens(node, ctx);
    case 'negate': return renderNegate(node, ctx);
    case 'power': return renderPower(node, ctx);
    case 'parallel': return renderParallel(node, ctx);
    case 'product': return renderProduct(node, ctx);
    case 'sum': return renderSum(node, ctx);
    default:
      throw new Error(`Unknown AST node type for LaTeX: ${node.type}`);
  }
}

function renderNumber(node) {
  let raw = node.value;
  let suffix = '';
  if (node.suffix) {
    raw = raw.slice(0, -node.suffix.length);
    suffix = `\\text{${node.suffix}}`;
  }

  // Check for scientific notation (E or e followed by exponent)
  const eMatch = raw.match(/^(.+?)[eE](.+)$/);
  if (eMatch) {
    const mantissa = eMatch[1];
    const exponent = eMatch[2];
    return new LatexRendered(
      `${mantissa}\\!\\times\\!10^{${exponent}}${suffix}`,
      { tall: true }
    );
  }

  return new LatexRendered(raw + suffix);
}

// TODO: ctx.variables and ctx.functions are threaded through but never checked.
// Unknown identifiers render as valid-looking LaTeX instead of being visually
// distinguished (e.g. red highlight). Validation catches these at grading time,
// but the preview could give earlier feedback.
function renderVariable(node, ctx) {
  let varname = node.name;

  // Handle tensor notation: check for _{...} and ^{...}
  const tensorMatch = varname.match(/^([a-zA-Z][a-zA-Z0-9]*)(\_{[^}]+\})?(\^{[^}]+\})?('+)?$/);
  if (tensorMatch && (tensorMatch[2] || tensorMatch[3])) {
    // Tensor notation - pass through mostly as-is, enriching the base
    let result = enrichVarname(tensorMatch[1]);
    if (tensorMatch[2]) result += tensorMatch[2];
    if (tensorMatch[3]) result += tensorMatch[3];
    if (tensorMatch[4]) result += tensorMatch[4];
    return new LatexRendered(result);
  }

  // Handle primes at the end
  let primes = '';
  const primeMatch = varname.match(/^(.+?)('+)$/);
  if (primeMatch) {
    varname = primeMatch[1];
    primes = primeMatch[2];
  }

  // Handle underscore subscripts
  const underscoreIdx = varname.indexOf('_');
  if (underscoreIdx >= 0) {
    const first = varname.slice(0, underscoreIdx);
    const second = varname.slice(underscoreIdx + 1);
    return new LatexRendered(
      `${enrichVarname(first)}_{${enrichVarname(second)}}${primes}`
    );
  }

  return new LatexRendered(enrichVarname(varname) + primes);
}

function renderFunction(node, ctx) {
  const fname = node.name;
  const innerRendered = renderNode(node.arg, ctx);
  let inner = innerRendered.latex;

  let formattedName;
  if (fname === 'sqrt') {
    inner = `{${inner}}`;
    formattedName = '\\sqrt';
  } else {
    if (innerRendered.tall) {
      inner = `\\left(${inner}\\right)`;
    } else {
      inner = `(${inner})`;
    }
    if (fname === 'log10') {
      formattedName = '\\log_{10}';
    } else if (fname === 'log2') {
      formattedName = '\\log_2';
    } else {
      formattedName = `\\text{${fname}}`;
    }
  }

  return new LatexRendered(formattedName + inner, { tall: innerRendered.tall });
}

function renderParens(node, ctx) {
  const inner = renderNode(node.expr, ctx);
  return new LatexRendered(inner.latex, { parens: '(', tall: inner.tall });
}

function renderNegate(node, ctx) {
  const inner = renderNode(node.expr, ctx);
  return new LatexRendered('-' + inner.latex, { tall: inner.tall });
}

function renderPower(node, ctx) {
  const baseRendered = renderNode(node.base, ctx);
  const expRendered = renderNode(node.exponent, ctx);
  // Strip outer parens from exponent
  const expLatex = expRendered.sans_parens;
  return new LatexRendered(
    `${baseRendered.latex}^{${expLatex}}`,
    { tall: true }
  );
}

function renderParallel(node, ctx) {
  const parts = node.operands.map(op => renderNode(op, ctx));
  const latex = parts.map(p => p.latex).join('\\|');
  const tall = parts.some(p => p.tall);
  return new LatexRendered(latex, { tall });
}

function renderFrac(numerator, denominator) {
  let numLatex;
  if (numerator.length === 1) {
    numLatex = numerator[0].sans_parens;
  } else {
    numLatex = numerator.map(k => k.latex).join('\\cdot ');
  }

  let denLatex;
  if (denominator.length === 1) {
    denLatex = denominator[0].sans_parens;
  } else {
    denLatex = denominator.map(k => k.latex).join('\\cdot ');
  }

  return `\\frac{${numLatex}}{${denLatex}}`;
}

function renderProduct(node, ctx) {
  // Gather all operands and operators
  const headRendered = renderNode(node.head, ctx);
  const items = [{ rendered: headRendered }];
  for (const { op, right } of node.tail) {
    items.push({ op, rendered: renderNode(right, ctx) });
  }

  // Smart fraction rendering - mirrors preview.py render_product
  let position = 'numerator';
  let fractionModeEver = false;
  let numerator = [];
  let denominator = [];
  let latex = '';

  // Add head to numerator
  numerator.push(items[0].rendered);

  for (let i = 1; i < items.length; i++) {
    const { op, rendered } = items[i];
    if (position === 'numerator') {
      if (op === '*') {
        numerator.push(rendered);
      } else {
        // op === '/'
        fractionModeEver = true;
        position = 'denominator';
        denominator.push(rendered);
      }
    } else {
      // position === 'denominator'
      if (op === '*') {
        // Render current fraction, switch back to numerator
        latex += renderFrac(numerator, denominator) + '\\cdot ';
        position = 'numerator';
        numerator = [rendered];
        denominator = [];
      } else {
        // op === '/'
        denominator.push(rendered);
      }
    }
  }

  // Add the fraction/numerator we ended on
  if (position === 'denominator') {
    latex += renderFrac(numerator, denominator);
  } else {
    // Ended on numerator -- act like normal multiplication
    latex += numerator.map(k => k.latex).join('\\cdot ');
  }

  const tall = fractionModeEver || items.some(it => it.rendered.tall);
  return new LatexRendered(latex, { tall });
}

function renderSum(node, ctx) {
  const headRendered = renderNode(node.head, ctx);
  let latex = headRendered.latex;
  let tall = headRendered.tall;

  for (const { op, right } of node.tail) {
    const rendered = renderNode(right, ctx);
    latex += op + rendered.latex;
    if (rendered.tall) tall = true;
  }

  return new LatexRendered(latex, { tall });
}
