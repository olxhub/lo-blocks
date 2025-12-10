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
//
// With key/distractor markers (Open edX style):
//   (x) Correct answer
//   ( ) Wrong answer
//   ( ) Another wrong answer
//   (x) Also correct (multiple keys allowed)

{
  function createOption(text, value, tag) {
    const trimmed = (text || '').trim();
    if (!trimmed) return null;
    const opt = {
      text: trimmed,
      value: value ? value.trim() : trimmed
    };
    if (tag) opt.tag = tag;
    return opt;
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
  = tag:marker? _ text:$[^,|\n\r]+ value:("|" v:$[^,\n\r]+ { return v; })? {
      return createOption(text, value, tag);
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
  = tag:marker? _ text:$[^|\n\r]+ value:("|" v:$[^\n\r]+ { return v; })? {
      return createOption(text, value, tag);
    }

// Last line might not have a newline
lastLine
  = _ tag:marker? _ text:$[^|\n\r]+ value:("|" v:$[^\n\r]* { return v; })? _ {
      return createOption(text, value, tag);
    }

// Key/Distractor markers - Open edX style
marker
  = "(x)" _ { return 'Key'; }
  / "( )" _ { return 'Distractor'; }

nl
  = "\r\n" / "\r" / "\n"

// Horizontal whitespace only
_
  = [ \t]*

// Any whitespace including newlines
__
  = [ \t\n\r]*
