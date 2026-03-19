/*---
description: Match items from left column to right column with a simple DSL syntax
---*/

start
  = title:title separator pairs:pair_item* {
      return {
        title: title.trim(),
        pairs: pairs.filter(p => p !== null)
      };
    }
  / pairs:pair_item* {
      return {
        title: '',
        pairs: pairs.filter(p => p !== null)
      };
    }

title
  = content:(!separator .)* {
      return content.map(c => c[1]).join('');
    }

separator
  = "=" "="+ newline+

pair_item
  = pair_line
  / blank_line { return null; }

pair_line
  = left:pair_content ":" space* right:line {
      return { left: left.trim(), right: right.trim() };
    }

pair_content
  = chars:(!":" !newline .)* {
      return chars.map(c => c[2]).join('');
    }

line
  = chars:(!newline .)* newline* {
      return chars.map(c => c[1]).join('').trim();
    }

blank_line
  = space* newline { return null; }

space
  = [ \t]

newline
  = "\r\n" / "\r" / "\n"
