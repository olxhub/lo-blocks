/*---
description: CAPA-style problem format (Open edX markdown compatible)
---*/
{
  function trimText(chars) {
    return chars.join("").trim();
  }

  function trimString(str) {
    return str.trim();
  }
}

document
  = __ blocks:(block __)* {
      return blocks.map(b => b[0]);
    }

block
  = questionSeparator
  / header
  / question
  / explanation
  / demandHints      // Must come before paragraph (starts with {{)
  / choiceBlock
  / checkboxBlock
  / numericalInput   // Must come before textInput (both start with =)
  / textInput
  / dropdown
  / hint
  / paragraph

// --- marks separation between questions in a multi-question problem
questionSeparator
  = '---' _ newline {
      return { type: "separator" };
    }

header
  = line:headerText newline '===' '='* _ newline {
      return { type: "h3", content: line };
    }

// Header text can contain special chars since it's followed by ===
headerText
  = chars:[^\n\r]+ {
      return trimText(chars);
    }

question
  = '>>' q:questionText '<<' _ newline {
      return { type: "question", label: q };
    }

// Question text can contain dropdown inline
questionText
  = parts:(dropdown / questionChars)+ {
      // If there's a dropdown, return structured; otherwise just text
      const hasDropdown = parts.some(p => typeof p === 'object');
      if (hasDropdown) {
        return parts;
      }
      return parts.join('').trim();
    }

// Match multiple non-special characters at once (not one at a time)
questionChars
  = chars:[^\n\r<>\[\]]+ { return chars.join(''); }

hint
  = '||' h:hintText '||' _ newline {
      return { type: "hint", content: h };
    }

hintText
  = chars:[^\n\r|]+ {
      return trimText(chars);
    }

// Demand hints: {{ hint1 ==== hint2 ==== hint3 }}
// Multi-line block with ==== separators between progressive hints
demandHints
  = '{{' _ newline hints:demandHintList '}}' _ newline {
      return { type: "demandHints", hints: hints };
    }

demandHintList
  = first:demandHintContent rest:(demandHintSeparator h:demandHintContent { return h; })* {
      return [first, ...rest];
    }

demandHintSeparator
  = _ '====' _ newline

demandHintContent
  = lines:demandHintLine+ {
      return lines.join('\n').trim();
    }

demandHintLine
  = !('====') !('}}') chars:[^\n\r]* newline {
      return chars.join('');
    }

// [explanation] ... [/explanation]
explanation
  = '[explanation]' _ newline content:explanationContent '[/explanation]' _ newline {
      return { type: "explanation", content: content.trim() };
    }

explanationContent
  = chars:(!('[/explanation]') .)* {
      return chars.map(c => c[1]).join('');
    }

// Multiple choice: (x) or ( )
// Outputs format compatible with ChoiceInput: { text, value, tag: 'Key'/'Distractor', feedback? }
choiceBlock
  = choices:choiceLine+ {
      return { type: "choices", options: choices };
    }

choiceLine
  = '(' marker:('x' / ' ') ')' _ t:choiceText feedback:inlineFeedback? _ newline {
      const result = {
        text: t,
        value: t,
        tag: marker === 'x' ? 'Key' : 'Distractor'
      };
      if (feedback) result.feedback = feedback;
      return result;
    }

// Checkbox: [x] or [ ]
// Outputs format compatible with ChoiceInput: { text, value, tag: 'Key'/'Distractor', feedback? }
checkboxBlock
  = choices:checkboxLine+ {
      return { type: "checkboxes", options: choices };
    }

checkboxLine
  = '[' marker:('x' / ' ') ']' _ t:choiceText feedback:inlineFeedback? _ newline {
      const result = {
        text: t,
        value: t,
        tag: marker === 'x' ? 'Key' : 'Distractor'
      };
      if (feedback) result.feedback = feedback;
      return result;
    }

// Choice/checkbox text - stops before {{ (feedback) or newline
choiceText
  = chars:[^\n\r{}]+ {
      return trimText(chars);
    }

// Inline feedback: {{ feedback text }}
inlineFeedback
  = '{{' content:feedbackContent '}}' {
      return content.trim();
    }

feedbackContent
  = chars:[^}]+ {
      return chars.join('');
    }

// Text input: = answer, or= alternative, not= wrong answer with feedback
// Outputs rules in StringMatch format: { answer, score, feedback? }
textInput
  = primary:textAnswer alternatives:textAlternative* {
      // Build rules array in StringMatch format
      const rules = [];

      // Primary answer (score 1)
      rules.push({
        answer: primary.answer,
        score: 1,
        feedback: primary.feedback || 'Correct!'
      });

      // Alternative correct answers (score 1)
      alternatives.filter(a => a.type === 'or').forEach(a => {
        rules.push({ answer: a.answer, score: 1, feedback: a.feedback || 'Correct!' });
      });

      // Wrong answers with targeted feedback (score 0)
      alternatives.filter(a => a.type === 'not').forEach(a => {
        rules.push({ answer: a.answer, score: 0, feedback: a.feedback || 'Incorrect' });
      });

      return { type: "textInput", rules: rules };
    }

textAnswer
  = '=' _ answer:answerText feedback:inlineFeedback? _ newline {
      const result = { answer: answer };
      if (feedback) result.feedback = feedback;
      return result;
    }

textAlternative
  = 'or=' _ answer:answerText feedback:inlineFeedback? _ newline {
      return { type: 'or', answer: answer, feedback: feedback };
    }
  / 'not=' _ answer:answerText feedback:inlineFeedback? _ newline {
      return { type: 'not', answer: answer, feedback: feedback };
    }

// Numerical input: = number, = number +- tolerance, = [min, max]
numericalInput
  = '=' _ value:number _ tolerance:tolerance? _ newline {
      const result = { type: "numericalInput", value: value };
      if (tolerance) result.tolerance = tolerance;
      return result;
    }
  / '=' _ '[' _ min:number _ ',' _ max:number _ ']' _ newline {
      return { type: "numericalInput", range: { min: min, max: max } };
    }

tolerance
  = '+-' _ value:number { return value; }

number
  = sign:'-'? digits:[0-9]+ decimal:('.' [0-9]+)? {
      const str = (sign || '') + digits.join('') + (decimal ? '.' + decimal[1].join('') : '');
      return parseFloat(str);
    }

// Answer text for text input (not numerical)
answerText
  = chars:[^\n\r{}]+ {
      return trimText(chars);
    }

// Dropdown: [[option1, (correct), option2]]
dropdown
  = '[[' options:dropdownOptions ']]' {
      return { type: "dropdown", options: options };
    }

dropdownOptions
  = first:dropdownOption rest:(',' _ opt:dropdownOption { return opt; })* {
      return [first, ...rest];
    }

dropdownOption
  = _ '(' text:dropdownText ')' _ {
      return { text: text, value: text, tag: 'Key' };
    }
  / _ text:dropdownText _ {
      return { text: text, value: text, tag: 'Distractor' };
    }

dropdownText
  = chars:[^\n\r,\[\]()]+ {
      return trimText(chars);
    }

paragraph
  = t:paragraphText newline {
      return { type: "p", content: t };
    }

// Paragraph text - must not start with special markers
paragraphText
  = !('(' ('x' / ' ') ')')
    !('[' ('x' / ' ') ']')
    !('||')
    !('{{')
    !('=')
    !('or=')
    !('not=')
    !('---')
    !('[explanation]')
    !('[/explanation]')
    !('>>')
    chars:[^\n\r]+ {
      return trimText(chars);
    }

newline = '\r\n' / '\n' / '\r'
_       = [ \t]*
__      = [ \t\n\r]*
