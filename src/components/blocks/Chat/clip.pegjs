/*
 * Grammar for parsing clip syntax.
 * Examples:
 *   (0, 5]
 *   [0,]
 *   [,5)
 *   [section_1, section_2]
 *   "Section Title"
 *   section_name
 *   [id1, 50)
 *
 * Output: { open, close, start, end }
 *  - open: "(" or "["
 *  - close: ")" or "]"
 *  - start: string | number | null
 *  - end: string | number | null
 */

Clip
  = RangeClip
  / SingleClip

RangeClip
  = _ open:OpenBracket _ start:Clip? _ "," _ end:Clip? _ close:CloseBracket _ {
      return {
        open,
        close,
        start: start ?? null,
        end: end ?? null,
        type: 'range'
      };
    }

SingleClip
  = QuotedString / Number / Identifier

// Identifiers don't have spaces, but if a person uses a section header in place of an identifier,
// we want to have a graceful fallback.
Identifier
  = id:$[a-zA-Z0-9_\. :-]+ {
      return { type: "identifier", "value": id.trim() };
    }

// Quoted string, e.g. "Section Title"
QuotedString
  = '"' chars:NotDoubleQuotedChar* '"' {
      return {type: "quoted", value: chars.join('')};
    }
  / "'" chars:NotSingleQuotedChar* "'" {
      return {type: "quoted", value: chars.join('')};
    }

NotDoubleQuotedChar
  = [^"]

NotSingleQuotedChar
  = [^']

Number
  = n:$[0-9]+ {
      return {type: "number", value: parseInt(n, 10)};
    }

OpenBracket
  = "[" / "("

CloseBracket
  = "]" / ")"

_ = [ \t\n\r]*   // whitespace