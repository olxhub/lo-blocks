// src/components/blocks/Sortable/sortable.pegjs
// PEG grammar for parsing .sortpeg files

{
  function createItem(index, content, id) {
    return {
      id: id || `item_${index}`,
      content: content.trim(),
      correctIndex: index
    };
  }
}

start
  = prompt:prompt separator items:item* {
      return {
        prompt: prompt.trim(),
        items: items.filter(item => item !== null),
        shuffle: true // Default to shuffled
      };
    }

prompt
  = content:(!separator .)* {
      return content.map(c => c[1]).join('').trim();
    }

separator
  = "=" "="+ newline+

item
  = numbered_line
  / blank_line { return null; }

numbered_line
  = index:number "." space* content:line {
      return createItem(index, content);
    }

number
  = digits:[0-9]+ { return parseInt(digits.join(''), 10); }

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