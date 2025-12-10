// src/components/blocks/input/DropdownInput/dropdown.pegjs
// PEG grammar for parsing DropdownInput content
//
// Supports two formats:
//
// Line-based (one option per line):
//   Red
//   Green
//   Blue
//
// Comma-separated:
//   Red, Green, Blue

{
  function createOption(text, value) {
    const trimmed = (text || '').trim();
    if (!trimmed) return null;
    return {
      text: trimmed,
      value: value ? value.trim() : trimmed
    };
  }
}

start
  = __ result:(commaSeparated / lineSeparated) __ {
      return { options: result.filter(o => o !== null) };
    }

// Comma-separated: Red, Green, Blue
// Must have at least one comma to distinguish from line-separated
commaSeparated
  = first:inlineOption _ "," _ rest:commaRest {
      return [first, ...rest];
    }

commaRest
  = head:inlineOption tail:(_ "," _ inlineOption)* {
      return [head, ...tail.map(t => t[3])];
    }

inlineOption
  = text:$[^,|\n\r]+ value:("|" v:$[^,\n\r]+ { return v; })? {
      return createOption(text, value);
    }

// Line-separated: each line is an option
lineSeparated
  = lines:line* last:lastLine? {
      const result = lines.filter(l => l !== null);
      if (last) result.push(last);
      return result;
    }

line
  = _ opt:lineOption _ nl { return opt; }
  / _ nl { return null; }

lineOption
  = text:$[^|\n\r]+ value:("|" v:$[^\n\r]+ { return v; })? {
      return createOption(text, value);
    }

// Last line might not have a newline
lastLine
  = _ text:$[^|\n\r]+ value:("|" v:$[^\n\r]* { return v; })? _ {
      return createOption(text, value);
    }

nl
  = "\r\n" / "\r" / "\n"

// Horizontal whitespace only
_
  = [ \t]*

// Any whitespace including newlines
__
  = [ \t\n\r]*
