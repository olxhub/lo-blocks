// TextHighlight PEG Grammar
// Parses text highlighting exercises with required, optional, and feedback-trigger segments

Document
  = prompt:Prompt "---" nl segments:Segments scoring:ScoringSection? feedback:FeedbackSection? {
      return {
        prompt: prompt.trim(),
        segments,
        scoring: scoring || [],
        targetedFeedback: feedback || {}
      };
    }

Prompt
  = (!("---") .)*  { return text().trim(); }

Segments
  = segments:Segment* { return segments.filter(s => s !== null); }

Segment
  = RequiredSegment
  / OptionalSegment  
  / FeedbackTriggerSegment
  / TextSegment

RequiredSegment
  = "[" content:SegmentContent id:LabelId? "]" {
      return { type: 'required', content, id };
    }

OptionalSegment
  = "{" content:SegmentContent id:LabelId? "}" {
      return { type: 'optional', content, id };
    }

FeedbackTriggerSegment
  = "<<" content:SegmentContent id:LabelId? ">>" {
      return { type: 'feedback_trigger', content, id };
    }

TextSegment
  = chars:TextChar+ {
      const text = chars.join('');
      return text ? { type: 'text', content: text } : null;
    }

SegmentContent
  = chars:ContentChar+ { return chars.join(''); }

ContentChar
  = EscapedBracket
  / ![|\[\]><] char:. { return char; }

TextChar
  = EscapedBracket
  / ![\[\]{}<>] !("---") char:. { return char; }

EscapedBracket
  = "\\" char:[\[\]{}()<>] { return char; }
  / "\\<<" { return "<<"; }
  / "\\>>" { return ">>"; }

LabelId
  = "|" id:Identifier { return id; }

ScoringSection
  = nl? "---" nl rules:ScoringRule* { return rules; }

ScoringRule
  = condition:ScoringCondition ":" _ feedback:FeedbackText nl? {
      return { condition, feedback };
    }

ScoringCondition
  = ComplexCondition
  / SimpleCondition
  / "" { return ''; }  // Default/fallback case

SimpleCondition
  = "all" { return 'all'; }
  / op:ComparisonOp num:Integer { return op + num; }

ComplexCondition
  = first:ConditionPart rest:("," part:ConditionPart { return part; })* {
      return [first].concat(rest).join(',');
    }

ConditionPart
  = field:ConditionField? op:ComparisonOp num:Integer {
      return (field || '') + op + num;
    }

ConditionField
  = "found" { return 'found'; }
  / "errors" { return 'errors'; }
  / "incorrect" { return 'incorrect'; }

ComparisonOp
  = ">" { return '>'; }
  / "<" { return '<'; }
  / ">=" { return '>='; }
  / "<=" { return '<='; }
  / "=" { return '='; }

FeedbackSection
  = nl? "---" nl items:FeedbackItem* {
      const feedback = {};
      items.forEach(item => {
        if (item.ids) {
          item.ids.forEach(id => {
            feedback[id] = item.text;
          });
        }
      });
      return feedback;
    }

FeedbackItem
  = ids:FeedbackIds ":" _ text:FeedbackText nl? {
      return { ids, text };
    }

FeedbackIds
  = first:Identifier rest:(_ "&" _ id:Identifier { return id; })* {
      return [first].concat(rest);
    }

FeedbackText
  = (!nl .)+ { return text().trim(); }

Identifier
  = chars:[a-zA-Z0-9_-]+ { return chars.join(''); }

Integer
  = digits:[0-9]+ { return parseInt(digits.join(''), 10); }

nl
  = [\r\n]+

_
  = [ \t]*