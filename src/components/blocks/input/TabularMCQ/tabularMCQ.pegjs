// src/components/blocks/TabularMCQ/tabularMCQ.pegjs
// PEG grammar for parsing TabularMCQ content
//
// Syntax:
//   mode: checkbox           (optional, defaults to 'radio')
//   cols: A, B|1, C|2        (text with optional |value for scoring)
//   rows: Q1, Q2|id, Q3[A]   (text with optional |id and [answer])
//
// Examples:
//   cols: love, like, neutral, dislike, hate
//   rows: Jim, Sue, Bob, Alice
//
//   cols: hate|-2, dislike|-1, neutral|0, like|1, love|2
//   rows: I enjoy parties|extrovert_1, I prefer solitude|introvert_1
//
//   cols: Noun, Verb, Adjective
//   rows: Dog[Noun], Run[Verb], Happy[Adjective]

{
  function toId(text) {
    // Convert text to a valid ID: lowercase, replace spaces with underscores
    return text.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  }

  function parseColItem(text, suffix) {
    const trimmed = text.trim();
    const id = toId(trimmed);
    const result = { text: trimmed, id };

    if (suffix !== null) {
      // Check if suffix is numeric (value) or string (id override)
      const num = parseFloat(suffix);
      if (!isNaN(num)) {
        result.value = num;
      } else {
        result.id = suffix;
      }
    }
    return result;
  }

  function parseRowItem(text, suffix, answer) {
    const trimmed = text.trim();
    const id = suffix !== null ? suffix : toId(trimmed);
    return {
      text: trimmed,
      id,
      answer: answer
    };
  }
}

start
  = __ mode:modeLine? __ cols:colsLine __ rows:rowsLine __ {
      return {
        mode: mode || 'radio',
        cols,
        rows
      };
    }

modeLine
  = "mode" _ ":" _ value:modeValue newline+ {
      return value;
    }

modeValue
  = "checkbox" { return 'checkbox'; }
  / "radio" { return 'radio'; }

colsLine
  = "cols" _ ":" _ items:colItems newline* {
      return items;
    }

colItems
  = first:colItem rest:(_ "," _ colItem)* {
      return [first, ...rest.map(r => r[3])];
    }

colItem
  = text:colText suffix:("|" colSuffix)? {
      return parseColItem(text, suffix ? suffix[1] : null);
    }

colText
  = chars:colChar+ { return chars.join(''); }

colChar
  = !([,|\n\r]) char:. { return char; }

colSuffix
  = chars:suffixChar+ { return chars.join('').trim(); }

suffixChar
  = !([,\[\]\n\r]) char:. { return char; }

rowsLine
  = "rows" _ ":" _ items:rowItems newline* {
      return items;
    }

rowItems
  = first:rowItem rest:(_ "," _ rowItem)* {
      return [first, ...rest.map(r => r[3])];
    }

rowItem
  = text:rowText suffix:("|" rowSuffix)? answer:("[" answerText "]")? {
      return parseRowItem(
        text,
        suffix ? suffix[1] : null,
        answer ? answer[1] : null
      );
    }

rowText
  = chars:rowChar+ { return chars.join(''); }

rowChar
  = !([,|\[\]\n\r]) char:. { return char; }

rowSuffix
  = chars:rowSuffixChar+ { return chars.join('').trim(); }

rowSuffixChar
  = !([,\[\]\n\r]) char:. { return char; }

answerText
  = chars:answerChar+ { return chars.join('').trim(); }

answerChar
  = !([\[\]\n\r]) char:. { return char; }

newline
  = "\r\n" / "\r" / "\n"

// Whitespace including newlines (for between lines)
__
  = [ \t\n\r]*

// Horizontal whitespace only (within a line)
_
  = [ \t]*
