// src/components/blocks/Chat/chat.pegjs
/*
 * Conversation Format Grammar
 * ---------------------------
 * This grammar defines a human-readable and machine-parseable format for
 * writing dialogue-driven scenarios — such as simulations, training modules,
 * or assessments — used in learning applications.
 *
 * The format supports:
 * - An optional document header with key-value metadata (e.g. Title, Author)
 * - A section divider (e.g. '---', '----') separating header and body
 * - Dialogue lines marked by speaker (e.g. "Bob: Hello there!")
 * - Inline and prefix metadata using [key=value] syntax, allowing annotations
 *   like mood, emotion, identifiers (id), class tags, and more
 * - Command lines using --- command-style syntax for flow control, triggers,
 *   or side-effects (e.g. --- waitFor: userInput ---)
 * - Support for structured referencing via ids, allowing external tools to
 *   embed, skip, or navigate sections of the conversation
 * - Line-level comments (# or //), and whitespace-tolerant formatting
 *
 * The goal is to empower content authors to write readable and structured
 * conversational flows without requiring complex tooling, while giving
 * developers a clean abstract syntax tree (AST) for use in rendering engines
 * like React, analytics, or adaptive behavior systems.
 *
 * Example:
 *
 *   Title: Clean Room Training
 *   Author: Dr. Z
 *   ~~~~~~
 *   --- waitFor: studentReady ---
 *   [id=start mood=excited]
 *   Bob: Welcome to the clean room! [expression=happy]
 *   Sue: Let’s get started. [class=highlight]
 *
 * Future features may include:
 * - Conditional flows
 * - Set/if/branch-style variable logic
 * - Embedded blocks or narrative steps
 * - Scene-wide metadata or defaults
 * - Integration with external state
 * - Support for LLM-driven interludes: conversational loops with an AI agent,
 *   potentially via a `>>> interactWithLLM: { ... }` command or section tag
 * - Variable setting, condition checking, and branching logic
 * - Support for referenced or inline OLX elements, such as:
 *
 *     Bob: Let's think about this.
 *     ::: <problem ref="problem_ref_1"/>
 *
 * - Handling of semantic flow cues (e.g. jump, continue, return)
 */


// The full document: optional header section followed by body
Conversation
  = ConversationWithHeader / ConversationBodyOnly

// Case 1: header + body
ConversationWithHeader
  = header:ConversationHeader divider:HeaderDivider body:ConversationBody {
      return { type: "Conversation", header, body };
    }

// Case 2: no header, just body
ConversationBodyOnly
  = body:ConversationBody {
      return { type: "Conversation", header: null, body };
    }

// Conversation header: key-value lines, like "Title: Example"
ConversationHeader
  = lines:(HeaderLine / CommentLine)* {
      const header = {};
      lines.forEach(line => {
        if (line && line.type === "HeaderField") {
          header[line.key] = line.value;
        }
      });
      return header;
    }

HeaderLine
  = key:Key _ ":" _ value:HeaderValue NewLine {
      return { type: "HeaderField", key, value };
    }

// Body of the document: could contain dialogues, commands, etc.
ConversationBody
  = lines:(CommentLine / SectionHeaderBlock / BlankLine / WaitCommand / PauseCommand / CommandBlock / ArrowCommand / DialogueGroup)* {
      return lines.filter(Boolean);
    }

SectionHeaderBlock
  = title:SectionHeaderTitle meta:InlineMetadata? _ NewLine underline:SectionUnderline BlankLine* {
      return {
        type: "SectionHeader",
        title: title.trim(),
        metadata: meta || {},
      };
  }

SectionHeaderTitle
  = chars:[^\r\n\[]+ { return chars.join(''); }

SectionUnderline
  = _ dashes:"-" dashTail:[\-*+]* _ NewLine {
      if (dashes.length + dashTail.length >= 3) return null;
      expected("at least 3 dashes in section underline");
    }

// Lookahead helper: detects a section header line followed by an underline
// without consuming any input. Used to prevent Dialogue continuation lines
// from capturing section headers.
SectionHeaderBlockStart
  = SectionHeaderTitle InlineMetadata? _ NewLine SectionUnderline

StartCommandBlock
  = "---"

EndCommandBlock
  = "---" _ NewLine

CommandContent
  = content:(!EndCommandBlock c:. { return c; })* {
      return content.join('');
  }

// Do we want multiline commands?
// Perhaps:
// CommandContent
//  = content:[^\r\n]* { return content.join(''); }

CommandBlock
  = _ StartCommandBlock _ content:CommandContent EndCommandBlock {
      return {
        type: "CommandBlock",
        command: content.trim()
      };
  }


/* Matches:   ElfForest -> sidebar            */
ArrowCommand
  = _ source:Identifier _ "->" _ target:Identifier _ NewLine {
      return { type: "ArrowCommand", source, target };
    }

/* helper so continuation lines don’t swallow arrow commands */
ArrowCommandStart
  = _ Identifier _ "->"


/* Pause command
 * Matches any line of the form
 *   --- pause ---
 *   -pause-
 *   --   pause   ----
 */
PauseCommandStart
  = _ "-"+ _ "pause"

PauseCommand
  = PauseCommandStart _ "-"+ _ NewLine {
      return { type: "PauseCommand" };
    }

/* ─────────────────────────────  Wait command  ────────────────────────── */
/*
 * Supported today in the parser (not necessarily in the code)
 *   --- wait lab1 ---
 *   --- wait lab1 submitted ---
 *   --- wait lab1 correct, quiz2 attempted ---
 *   --- wait quiz1 score>=8, quiz2 attempted ---
 *
 * Possible future plans (not yet enforced/evaluated)
 *   - dotted sub-IDs:    problemA.score
 *   - boolean operators: (lab1 correct OR quiz2 correct) AND hw1 submitted
 */

WaitCommandStart
  = _ "-"+ _ "wait"

WaitCommand
  = WaitCommandStart _ reqs:WaitRequirementList _ "-"+ _ NewLine {
      return { type: "WaitCommand", requirements: reqs };
    }

WaitRequirementList
  = first:WaitRequirement rest:(_ "," _ WaitRequirement)* {
      return [first].concat(rest.map(r => r[3]));
    }

WaitRequirement
  = _ id:Identifier cond:RequirementCondition? {
      return cond ? { id, ...cond } : { id };
    }

/* status words such as submitted / correct / attempted */
RequirementCondition
  = _ field:Identifier _ op:CompOp _ n:Num {
      return { field, op, value: parseFloat(n) };
    }
  / _ status:StatusWord { const normalizedStatus = Array.isArray(status) ? status.flat(Infinity).join('') : status; return { status: normalizedStatus }; }

StatusWord       = $[a-zA-Z0-9_][a-zA-Z0-9_-]+
CompOp           = ">=" / "<=" / ">" / "<" / "="
Num              = $[0-9]+ ("." [0-9]+)?


DialogueGroup
  = metaAbove:MetadataLine? line:DialogueLine continuation:ContinuationLine* {
      const textLines = [line.text].concat(continuation.map(c => c.text));
      return {
        type: "Line",
        speaker: line.speaker,
        text: textLines.join("\n"),
        metadata: {
          ...(metaAbove ? metaAbove.data : {}),
          ...(line.metadata || {})
        }
      };
  }

ContinuationLine
  = !SectionHeaderBlockStart !DialogueLineStart !MetadataLineStart !StartCommandBlock !ArrowCommand !PauseCommandStart !WaitCommandStart !CommentLineStart content:LineContent NewLine {
      return { text: content };
  }

DialogueLineStart
  = Key ":" _

MetadataLineStart
  = _ "["

DialogueLine
  = speaker:Key ":" _ text:SpeechContent meta:InlineMetadata? NewLine {
      return {
        speaker,
        text,
        metadata: meta || {}
      };
  }

// Metadata. E.g. [key=value key=value ...]
InlineMetadata
  = _ "[" pairs:MetadataPairs "]" {
      return pairs;
  }

MetadataLine
  = _ "[" pairs:MetadataPairs "]" NewLine {
      return { type: "Metadata", data: pairs };
  }

MetadataPairs
  = first:MetadataPair rest:(_ MetadataPair)* {
      const result = { [first.key]: first.value };
      rest.forEach(([_, pair]) => {
        result[pair.key] = pair.value;
      });
      return result;
  }

MetadataPair
  = key:Key "=" value:MetadataValue {
      return { key, value };
  }

// Comments: lines starting with '#' or '//' and ignored
CommentLineStart
  = _ ("#" / "//")

CommentLine
  = CommentLineStart [^\r\n]* NewLine {
      return null;
    }

// A divider between metadata and text — e.g. '~~~' or '~~~~~~'
HeaderDivider
  = dashes:"~" dashTail:[\~*+]* NewLine {
      if (dashes.length + dashTail.length >= 3) return "divider";
      expected("at least 3 dashes in section divider");
    }

// Content of a line, anything except newline
LineContent
  = chars:[^\r\n]* {
      return chars.join('').trim();
    }

SpeechContent
  = chars:[^\[\r\n]* {
      return chars.join('').trim();
  }

// Helpers for keys and values in header fields
Key
  = chars:[a-zA-Z0-9 _-]+ {
      return chars.join('').trim();
    }

HeaderValue
  = chars:[^\r\n]* {
      return chars.join('').trim();
    }

MetadataValue
  = QuotedValue / UnquotedValue

QuotedValue
  = '"' chars:([^"]*) '"' {
      return chars.join('');
  }

UnquotedValue
  = chars:[^ \r\n=\[\]]+ {
      return chars.join('');
  }

// Newline and whitespace helpers
NewLine
  = '\r\n' / '\n' / '\r'

_ = [ \t]*

// Whitespace with a newline
BlankLine
  = _ NewLine {
      return null;
  }

Identifier
  = $[a-zA-Z0-9_.-]+    // token characters. Note we include ._-
