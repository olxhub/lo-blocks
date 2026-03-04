/*---
description: Template syntax with {{placeholder}} substitution
---*/
// Template.pegjs

Template
  = (Text / Placeholder)*

Text
  = (!"{{" .)+   { return { type: "text", value: text() }; }

Placeholder
  = "{{" _ name:Identifier _ "}}" { return { type: "placeholder", name }; }

//Identifier
//  = [a-zA-Z_][a-zA-Z0-9_]*

Identifier
  = first:[a-zA-Z_] rest:[a-zA-Z0-9_]* { return first + rest.join(""); }

_  // Optional whitespace
  = [ \t]*
