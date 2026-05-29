/*---
description: Format for dialogue-driven scenarios, simulations, and training modules
---*/
// src/components/blocks/Chat/chat.pegjs
/*
 * Conversation Format Grammar
 * ---------------------------
 * This grammar defines a human-readable and machine-parseable format for
 * writing dialogue-driven scenarios — such as simulations, training modules,
 * or assessments — used in learning applications.
 *
 * The format supports:
 * - An optional document header with key-value metadata (e.g. title, author)
 * - A section divider (e.g. '---', '----') separating header and body
 * - Dialogue lines marked by speaker (e.g. "Bob: Hello there!")
 * - Inline and prefix metadata using [key=value] syntax, allowing annotations
 *   like mood, emotion, identifiers (id), class tags, and more
 * - Command lines using --- command-style syntax for flow control, triggers,
 *   or side-effects (e.g. --- waitFor: userInput ---)
 * - Support for structured referencing via ids, allowing external tools to
 *   embed, skip, or navigate sections of the conversation
 * - Line-level comments (//), and whitespace-tolerant formatting
 *
 * The goal is to empower content authors to write readable and structured
 * conversational flows without requiring complex tooling, while giving
 * developers a clean abstract syntax tree (AST) for use in rendering engines
 * like React, analytics, or adaptive behavior systems.
 *
 * Example:
 *
 *   title: Clean Room Training
 *   author: Dr. Z
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
 * - Inline-in-bubble embeds (::ref:: within speaker text) could allow
 *   small blocks to render inside a chat bubble. Deferred until there's
 *   a concrete use case — block-level ::ref handles most scenarios.
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

// Conversation header: raw text before the ~~~~ divider.
// Returned as a string to be parsed as YAML by downstream code,
// which supports both simple key-value pairs and nested structures
// like participant definitions.
ConversationHeader
  = chars:(!HeaderDivider c:. { return c; })* {
      return chars.join('');
    }

// Body of the document: could contain dialogues, commands, etc.
ConversationBody
  = lines:(CommentLine / SectionHeaderBlock / BlankLine / WaitCommand / PauseCommand / CommandBlock / ArrowCommand / EmbedCommand / EmbedBlock / DialogueGroup)* {
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
  = _ dash:"-" dashTail:[\-*+]* _ NewLine {
      if (1 + dashTail.length >= 3) return null;
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
 *
 * Inserts a hard stop between commands that would otherwise execute together.
 *
 * Normal flow: each "Continue" click reveals the next batch of messages AND
 * executes any commands (arrows, embeds, waits) that precede them. Multiple
 * consecutive commands run simultaneously.
 *
 * --- pause --- forces a break: commands before the pause execute, the user
 * must click Continue, and only then do commands after the pause execute.
 * This is rarely needed — it is NOT a progressive reveal between dialogue
 * lines (the user already clicks Continue for each new batch of dialogue).
 *
 * Matches any line of the form:
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
 * Wait commands use state language expressions:
 *   --- wait @grader.correct === correctness.correct ---
 *   --- wait @essay.value ---
 *   --- wait @quiz.done === completion.done && @essay.value ---
 */

WaitCommandStart
  = _ "-"+ _ "wait"

WaitCommand
  = WaitCommandStart _ expr:WaitExpression _ "-"+ _ NewLine {
      return { type: "WaitCommand", expression: expr };
    }

WaitExpression
  = chars:[^-\r\n]+ { return chars.join('').trim(); }


/* ──────────────────────────  Embed directives  ──────────────────────── */
/*
 * Block-level embeds reference other blocks or include literal OLX:
 *
 *   ::problem_1                         Embed by reference
 *   ::video_1 [fullscreen]              With inline metadata
 *   ::video_1                           With YAML-style options
 *     fullscreen: true
 *     label: Watch a video
 *   ::                                  Fenced inline OLX
 *   <MCQ id="quick">...</MCQ>
 *   ::
 *
 * Future: inline-in-bubble embeds (::ref:: within speaker text) could
 * allow small blocks inside a chat bubble. Deferred until concrete
 * use case — block-level ::ref handles most scenarios.
 */

// Lookahead helper to prevent continuation lines from swallowing embeds
EmbedStart
  = _ "::"

// Embed by reference, with optional inline metadata and/or YAML options.
// The YAML options block (indented lines after the directive) is returned
// as a raw string for downstream YAML parsing.
EmbedCommand
  = _ "::" ref:Identifier _ meta:InlineMetadata? _ NewLine yaml:IndentedBlock? {
      return { type: "EmbedCommand", ref, metadata: meta || {}, options: yaml || null };
  }

// Fenced inline OLX — :: opens and closes the block.
// Everything between the fences is returned as raw content.
EmbedBlock
  = _ "::" _ meta:InlineMetadata? _ NewLine content:EmbedBlockContent _ "::" _ NewLine {
      return { type: "EmbedBlock", ref: null, content: content.trim(), metadata: meta || {} };
  }

EmbedBlockContent
  = chars:(!(_ "::" _ NewLine) c:. { return c; })* {
      return chars.join('');
  }


DialogueGroup
  = metaAbove:MetadataLine? line:DialogueLine continuation:ContinuationLine* indented:IndentedBlock? {
      const parts = [line.text].concat(continuation.map(c => c.text));
      // Join inline text, then append indented block with paragraph break.
      // Trim trailing newlines (from empty continuation lines) before joining.
      const inlineText = parts.join("\n");
      const text = indented ? inlineText.replace(/\n*$/, '') + "\n\n" + indented : inlineText;
      return {
        type: "Line",
        speaker: line.speaker,
        text,
        metadata: {
          ...(metaAbove ? metaAbove.data : {}),
          ...(line.metadata || {})
        }
      };
  }

ContinuationLine
  = !SectionHeaderBlockStart !DialogueLineStart !MetadataLineStart !StartCommandBlock !ArrowCommand !PauseCommandStart !WaitCommandStart !CommentLineStart !IndentedLine !EmbedStart content:LineContent NewLine {
      return { text: content };
  }

/* ─────────────────────────  Indented rich content  ───────────────────────── */
/*
 * After a speaker line, lines indented 2+ spaces form a rich markdown block.
 * Within the block, all chatpeg special syntax ([metadata], --- commands)
 * is treated as literal text — only indentation matters.
 *
 * Single blank lines are preserved as paragraph breaks.
 * Two consecutive blank lines (or a non-indented non-blank line) end the block.
 *
 *   Kim: Here's what the research shows:
 *
 *     The results were striking:
 *
 *     - Testing improved retention by 50%
 *     - Re-reading only improved it by 20%
 *
 *     > Roediger & Karpicke, 2006
 *
 *   Alex: Wow! [face=awe]
 */

IndentedBlock
  = BlankLine* first:IndentedLine rest:(IndentedBlankLine / IndentedLine)* {
      return [first, ...rest].join("\n");
  }

// A content line with 2+ leading spaces (stripped from output)
IndentedLine
  = "  " content:[^\r\n]* NewLine {
      return content.join('');
  }

// A blank line within an indented block — only valid if followed by another
// indented line (lookahead prevents consuming trailing blank lines)
IndentedBlankLine
  = _ NewLine &((_ NewLine)* IndentedLine) {
      return "";
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

// Comments: lines starting with '//'
CommentLineStart
  = _ "//"

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

// Captures text up to the first `[` (which starts inline metadata).
// Limitation: literal `[` in speech text is not supported — use an
// indented block for text containing square brackets.
// TODO: Add support for escaping (e.g. \[)
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

Namespace
  = $([a-zA-Z_][a-zA-Z0-9_]* ("." [a-zA-Z_][a-zA-Z0-9_]*)* "/")

Identifier
  = $(Namespace? [a-zA-Z0-9_.-]+)
