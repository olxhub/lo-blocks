# Chat

Conversational learning interface with dialogue, activities, and flow control.

```olx:playground
<Chat id="discussion" title="Study Group">
Title: Study Group
Participants:
  Kim:
    seed: kim_researcher
    face: smile
  Alex:
    seed: alex_student
~~~~

Kim: Did you read the Roediger study? Students who took practice tests remembered 50% more after a week.

Alex: That's counterintuitive. You'd think studying more would help more than testing.

--- pause ---

Kim: That's exactly why it's called "desirable difficulty" — it feels harder during practice but produces better long-term retention.

Alex: So re-reading feels productive but mostly builds familiarity? [face=awe]

Kim: Exactly. Testing forces retrieval, which strengthens the memory trace.
</Chat>
```

## External File Usage

```olx:code
<Chat id="discussion" src="conversation.chatpeg" title="Study Group" />
```

## Chatpeg Format

See the Chatpeg Grammar Reference for the full specification. Summary below.

### Header

YAML format before the `~~~~` divider. Supports simple metadata and nested structures like participant definitions:

```
Title: Learning Discussion
Author: Education Team
Participants:
  Kim:
    seed: kim_researcher
    face: smile
  Alex:
    seed: alex_student
~~~~
```

### Participants &amp; Avatars

Define avatar appearance for each speaker in the header. Not every participant needs options — a bare entry like `Alex:` uses the speaker name as the avatar seed.

```
Participants:
  Kim:
    seed: kim_researcher
    face: smile
    skinColor: ["694d3d"]
  Alex:
```

Per-line expression overrides use inline metadata:

```
Kim: That's fascinating! [face=awe]
Alex: I'm not so sure. [face=serious]
```

Header keys are **case-sensitive**. The parser warns on casing mistakes (e.g., `Seed` instead of `seed`).

See the Chatpeg Grammar Reference for the full avatar option tables.

### Sections

Section headers with underlines organize content:

```
Introduction
------------

Alex: Welcome!

Main Discussion
---------------

Alex: Let's dive in.
```

### Inline Metadata

Annotate any dialogue line with `[key=value]` pairs:

```
Kim: This is a key point. [id=key_finding face=smile]
```

Use `id` for clipping and navigation. Use `face` for per-line expression overrides. Metadata can also appear on a standalone line above dialogue.

### Commands

**Pause** — Waits for user to click continue:

```
--- pause ---
```

**Wait** — Blocks until a state language expression is truthy:

```
--- wait @component_id.value ---
--- wait @quiz.correct === correctness.correct ---
--- wait wordcount(@essay.value) >= 50 ---
```

See [State Language Expressions](../../../lib/stateLanguage/expr.pegjs.md) for full syntax.

**Arrow** — Repoints a dynamic component to show different content:

```
sidebar -> student_input
```

Place arrow commands **before** the dialogue that references the new content.

## Activities Pattern

Integrate student activities into conversation flow:

```olx:playground
<Vertical id="lesson">
  <Hidden>
    <Vertical id="prediction">
      <Markdown>**Your Prediction**</Markdown>
      <TextArea id="prediction_input" placeholder="Which do you think is more effective for long-term retention?" />
    </Vertical>
    <Vertical id="summary">
      <Markdown>**Key Finding**</Markdown>
      <Markdown>Spacing study sessions produces dramatically better retention than massed practice.</Markdown>
    </Vertical>
  </Hidden>

  <SplitPanel sizes="65,35">
    <LeftPane>
      <Chat id="chat" title="Peer Discussion">
Title: Peer Discussion
~~~~

Alex: Before we look at the research, what do you think: is it better to study in one long session or multiple shorter sessions?

--- wait prediction_input ---

Kim: Interesting! Let's see what the research says...

--- pause ---

Kim: Cepeda et al. found that spacing study sessions produces dramatically better retention — especially when the spacing matches how long you need to remember.

sidebar -> summary
      </Chat>
    </LeftPane>
    <RightPane>
      <UseHistory id="sidebar" initial="prediction" />
    </RightPane>
  </SplitPanel>
</Vertical>
```

## Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `id` | Yes | Unique identifier |
| `src` | No | Path to .chatpeg file |
| `title` | No | Display title |
| `clip` | No | Show only specific section(s) |
| `history` | No | Include earlier sections as context |
| `height` | No | Container height (e.g., `"400px"` or `"flex-1"`) |

### Clips

A single conversation script can span multiple screens or sections of a course. Write the full dialogue once, then use clips to show specific sections where needed:

```olx:code
<Chat id="ch1" src="full.chatpeg" clip="Introduction" />
<Chat id="ch2" src="full.chatpeg" clip="Main Discussion" history="Introduction" />
```

The `history` attribute provides earlier context so the conversation flows naturally even when split across pages.

## State Fields

- `value` — Current position in dialogue
- `isDisabled` — Whether advance is blocked (waiting)
- `sectionHeader` — Current section title

## Pedagogical Applications

Chat supports scenario-based assessments where students join ongoing discussions, contributing analysis that influences how the conversation unfolds. Characters model different perspectives and reasoning approaches. The format increases engagement through social presence while the wait/activity pattern creates natural reflection points.

The predict-then-explain pattern shown above leverages the finding that making predictions improves subsequent encoding of correct information (Roediger &amp; Karpicke, 2006).

## Related Blocks

- **UseHistory** — Displays timeline of student responses
- **Hidden** — Contains activity components referenced by chat
- **SplitPanel** — Common layout with chat and sidebar
- **TextArea** — Student input that chat can wait for
- **TalkBubble** — Static speech bubbles (uses the same Avatar component)
