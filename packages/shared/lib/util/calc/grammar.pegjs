// openedx-calc PEG grammar for Peggy.js
//
// Operator precedence (lowest to highest):
//   1. Sum:      + -     (with leading unary sign)
//   2. Product:  * /
//   3. Parallel: ||      (resistor formula)
//   4. Power:    ^       (right-associative)
//   5. Atom:     number, function call, variable, parenthesized expr

// ============================================================
// Top-level rule
// ============================================================

Expression
  = _ expr:Sum _ {
      return expr;
    }

// ============================================================
// Sum: addition / subtraction with optional leading sign
// ============================================================

Sum
  = head:SignedProduct tail:(_ op:("+" / "-") _ right:Product { return { op, right }; })* {
      if (tail.length === 0) return head;
      return { type: 'sum', head, tail };
    }

SignedProduct
  = sign:("-" / "+")? _ value:Product {
      if (!sign || sign === '+') return value;
      return { type: 'negate', expr: value };
    }

// ============================================================
// Product: multiplication / division
// ============================================================

Product
  = head:Parallel tail:(_ op:("*" / "/") _ right:Parallel { return { op, right }; })* {
      if (tail.length === 0) return head;
      return { type: 'product', head, tail };
    }

// ============================================================
// Parallel: resistor operator ||
// ============================================================

Parallel
  = head:Power tail:(_ "||" _ right:Power { return right; })* {
      if (tail.length === 0) return head;
      return { type: 'parallel', operands: [head, ...tail] };
    }

// ============================================================
// Power: exponentiation (right-associative via right-recursion)
// ============================================================

Power
  = base:Atom _ "^" _ sign:("-" / "+")? _ exp:Power {
      let exponent = exp;
      if (sign === '-') exponent = { type: 'negate', expr: exp };
      return { type: 'power', base, exponent };
    }
  / Atom

// ============================================================
// Atom: highest precedence - numbers, functions, variables, parens
// ============================================================

Atom
  = Number
  / FunctionCall
  / Variable
  / "(" _ expr:Sum _ ")" {
      return { type: 'parens', expr };
    }

// ============================================================
// Function call: fname(expr)
// ============================================================

FunctionCall
  = name:Identifier _ "(" _ arg:Sum _ ")" {
      return { type: 'function', name, arg };
    }

// ============================================================
// Variable (including tensor notation and primes)
// ============================================================

Variable
  = name:TensorMixed {
      return { type: 'variable', name };
    }
  / name:TensorLower {
      return { type: 'variable', name };
    }
  / name:PlainVariable {
      return { type: 'variable', name };
    }

TensorMixed
  = base:$([a-zA-Z] [a-zA-Z0-9]*) lower:("_{" content:$([a-zA-Z0-9]+) "}" { return "_{" + content + "}"; })? "^{" upper:$([a-zA-Z0-9]+) "}" primes:$("'"*) {
      return base + (lower || '') + "^{" + upper + "}" + primes;
    }

TensorLower
  = base:$([a-zA-Z] [a-zA-Z0-9]*) "_{" lower:$([a-zA-Z0-9]+) "}" primes:$("'"*) {
      return base + "_{" + lower + "}" + primes;
    }

PlainVariable
  = name:Identifier primes:$("'"*) !(_ "(") {
      return name + primes;
    }

// ============================================================
// Identifier: used for function names and plain variable bases
// ============================================================

Identifier
  = $([a-zA-Z] [a-zA-Z0-9_]*)

// ============================================================
// Number
// ============================================================
// Sign is NOT part of Number - handled by Sum/SignedProduct.
// Examples: 13, 3.14, .618, 4., 5e1, 5e+1, 500e-1, 4.2%

Number
  = value:NumberLiteral suffix:Suffix? {
      return {
        type: 'number',
        value: value + (suffix || ''),
        suffix: suffix || null
      };
    }

NumberLiteral
  = mantissa:Mantissa exponent:Exponent? {
      return mantissa + (exponent || '');
    }

Mantissa
  = $([0-9]+ "." [0-9]*)
  / $("." [0-9]+)
  / $([0-9]+)

Exponent
  = $([eE] [+-]? [0-9]+)

Suffix
  = "%"

// ============================================================
// Whitespace
// ============================================================

_ "whitespace"
  = [ \t\n\r]*
