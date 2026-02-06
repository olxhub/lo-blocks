/*---
description: State language expression parser - produces AST
---*/

// ============================================
// Entry Point
// ============================================

Expression
  = Ternary

// ============================================
// Ternary (lowest precedence)
// ============================================

Ternary
  = cond:LogicalOr _ "?" _ then:Ternary _ ":" _ else_:Ternary {
      return { type: 'Ternary', condition: cond, then, else: else_ };
    }
  / LogicalOr

// ============================================
// Logical Operators
// ============================================

LogicalOr
  = head:LogicalAnd tail:(_ "||" _ LogicalAnd)* {
      return tail.reduce((left, [, op, , right]) => ({
        type: 'BinaryOp', op, left, right
      }), head);
    }

LogicalAnd
  = head:Equality tail:(_ "&&" _ Equality)* {
      return tail.reduce((left, [, op, , right]) => ({
        type: 'BinaryOp', op, left, right
      }), head);
    }

// ============================================
// Comparison Operators
// ============================================

Equality
  = head:Comparison tail:(_ ("===" / "!==") _ Comparison)* {
      return tail.reduce((left, [, op, , right]) => ({
        type: 'BinaryOp', op, left, right
      }), head);
    }

Comparison
  = head:Additive tail:(_ (">=" / "<=" / ">" / "<") _ Additive)* {
      return tail.reduce((left, [, op, , right]) => ({
        type: 'BinaryOp', op, left, right
      }), head);
    }

// ============================================
// Arithmetic Operators
// ============================================

Additive
  = head:Multiplicative tail:(_ ("+" / "-") _ Multiplicative)* {
      return tail.reduce((left, [, op, , right]) => ({
        type: 'BinaryOp', op, left, right
      }), head);
    }

Multiplicative
  = head:Unary tail:(_ ("*" / "/") _ Unary)* {
      return tail.reduce((left, [, op, , right]) => ({
        type: 'BinaryOp', op, left, right
      }), head);
    }

// ============================================
// Unary Operators
// ============================================

Unary
  = "!" _ arg:Unary { return { type: 'UnaryOp', op: '!', argument: arg }; }
  / PostfixExpr

// ============================================
// Postfix (member access, calls)
// ============================================

PostfixExpr
  = head:Primary tail:(
      "." id:Identifier { return { type: 'member', property: id }; }
    / "(" _ args:ArgumentList? _ ")" { return { type: 'call', arguments: args || [] }; }
  )* {
      return tail.reduce((obj, part) => {
        if (part.type === 'member') {
          return { type: 'MemberAccess', object: obj, property: part.property };
        }
        if (part.type === 'call') {
          return { type: 'Call', callee: obj, arguments: part.arguments };
        }
        return obj;
      }, head);
    }

ArgumentList
  = head:ArgumentExpr tail:(_ "," _ ArgumentExpr)* {
      return [head, ...tail.map(t => t[3])];
    }

// Arguments can be expressions or arrow functions
ArgumentExpr
  = ArrowFunction
  / Expression

// ============================================
// Arrow Functions (for array methods)
// ============================================

ArrowFunction
  = param:Identifier _ "=>" _ body:Expression {
      return { type: 'ArrowFunction', param, body };
    }

// ============================================
// Primary Expressions
// ============================================

Primary
  = SigilRef
  / BooleanLiteral
  / Number
  / String
  / TemplateLiteral
  / ObjectLiteral
  / MathObject
  / id:Identifier { return { type: 'Identifier', name: id }; }
  / "(" _ expr:Expression _ ")" { return expr; }

// ============================================
// Boolean Literals
// ============================================

BooleanLiteral
  = "true" !IdentifierChar { return { type: 'Boolean', value: true }; }
  / "false" !IdentifierChar { return { type: 'Boolean', value: false }; }

IdentifierChar
  = [a-zA-Z0-9_]

// ============================================
// Object Literals
// ============================================

ObjectLiteral
  = "{" _ pairs:ObjectPairs? _ "}" {
      const properties = {};
      for (const { key, value } of (pairs || [])) {
        properties[key] = value;
      }
      return { type: 'Object', properties };
    }

ObjectPairs
  = head:ObjectPair tail:(_ "," _ ObjectPair)* {
      return [head, ...tail.map(t => t[3])];
    }

ObjectPair
  = key:Identifier _ ":" _ value:Expression {
      return { key, value };
    }

// ============================================
// Sigil References
// ============================================

// Supports both simple identifiers and quoted paths:
//   @essay.value           - simple identifier
//   @"/mit.edu/hw1/q3".value  - quoted path for full namespace

SigilRef
  = sigil:[@#$] id:SigilId fields:("." Identifier)* {
      return {
        type: 'SigilRef',
        sigil,
        id,
        fields: fields.map(f => f[1])
      };
    }

SigilId
  = QuotedPath
  / Identifier

QuotedPath
  = '"' chars:QuotedPathChar* '"' { return chars.join(''); }

QuotedPathChar
  = '\\"' { return '"'; }
  / '\\\\' { return '\\'; }
  / [^"\\]

// ============================================
// Special Identifiers
// ============================================

// Math.xxx - we whitelist specific math functions
MathObject
  = "Math" { return { type: 'Identifier', name: 'Math' }; }

// ============================================
// Literals
// ============================================

Number
  = digits:$([0-9]+ ("." [0-9]+)?) {
      return { type: 'Number', value: parseFloat(digits) };
    }

String
  = DoubleQuotedString
  / SingleQuotedString

DoubleQuotedString
  = '"' chars:DoubleQuotedChar* '"' {
      return { type: 'String', value: chars.join('') };
    }

DoubleQuotedChar
  = '\\"' { return '"'; }
  / '\\\\' { return '\\'; }
  / [^"\\]

SingleQuotedString
  = "'" chars:SingleQuotedChar* "'" {
      return { type: 'String', value: chars.join('') };
    }

SingleQuotedChar
  = "\\'" { return "'"; }
  / '\\\\' { return '\\'; }
  / [^'\\]

TemplateLiteral
  = "`" parts:TemplatePart* "`" {
      return { type: 'TemplateLiteral', parts };
    }

TemplatePart
  = TemplateExpression
  / TemplateChars

TemplateExpression
  = "${" _ expr:Expression _ "}" {
      return { type: 'TemplateExpr', expression: expr };
    }

TemplateChars
  = chars:$([^`$\\] / "\\`" / "\\$" / "\\\\")+ {
      return { type: 'TemplateText', value: chars.replace(/\\([`$\\])/g, '$1') };
    }

// ============================================
// Basic Elements
// ============================================

Identifier
  = !ReservedWord name:$([a-zA-Z_][a-zA-Z0-9_]*) { return name; }

ReservedWord
  = ("true" / "false" / "null" / "undefined") ![a-zA-Z0-9_]

_ "whitespace"
  = [ \t\n\r]*
