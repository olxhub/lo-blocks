{
  function trimText(chars) {
    return chars.join("").trim();
  }
}

document
  = _ blocks:(block _)* {
      return blocks.map(b => b[0]);
    }

block
  = header
  / question
  / choiceBlock
  / hint
  / paragraph

header
  = line:lineText newline '===' newline {
      return { type: "h3", content: line };
    }

question
  = '>>' q:lineText '<<' newline {
      return { type: "question", label: q };
    }

hint
  = '||' h:lineText '||' newline {
      return { type: "hint", content: h };
    }

choiceBlock
  = choices:(choiceLine+ newline?) {
      return { type: "choices", options: choices };
    }

choiceLine
  = c:('(' marker:('x' / ' ') ')' _ t:lineText newline {
      return { selected: marker === 'x', text: t };
    })

paragraph
  = t:lineText newline {
      return { type: "p", content: t };
    }

lineText
  = chars:[^\n\r<>\[\]()|]+ {
      return trimText(chars);
    }

newline = '\r\n' / '\n' / '\r'
_       = [ \t]*