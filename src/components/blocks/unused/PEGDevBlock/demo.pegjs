// src/components/blocks/PEGDevBlock/demo.pegjs
{
  // Helper to build nodes
  function makeBinary(op, left, right) {
    return { type: "BinaryExpression", operator: op, left, right };
  }
  function makeCall(fn, arg) {
    return { type: "FunctionCall", name: fn, argument: arg };
  }
}

Expression
  = head:Term tail:(_ ("+" / "-") _ Term)* {
      return tail.reduce((acc, t) => makeBinary(t[1], acc, t[3]), head);
    }

Term
  = head:Factor tail:(_ ("*" / "/") _ Factor)* {
      return tail.reduce((acc, t) => makeBinary(t[1], acc, t[3]), head);
    }

Factor
  = head:Power tail:(_ "^" _ Power)* {
      return tail.reduce((acc, t) => makeBinary("^", acc, t[3]), head);
    }

Power
  = FunctionCall
  / Primary

FunctionCall
  = name:Identifier _ "(" _ arg:Expression _ ")" {
      return makeCall(name, arg);
    }

Primary
  = Number
  / Variable
  / "(" _ Expression _ ")"

Number
  = n:([0-9]+ ("." [0-9]+)?) {
      return { type: "NumberLiteral", value: parseFloat(n.join("")) };
    }

Variable
  = name:Identifier {
      return { type: "Variable", name };
    }

Identifier
  = $([a-zA-Z_][a-zA-Z0-9_]*)

_ "whitespace"
  = [ \t\n\r]*
