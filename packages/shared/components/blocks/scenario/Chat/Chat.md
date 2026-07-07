# Chat

Conversational learning interface with dialogue, activities, and flow control.

```olx:playground
<Chat id="discussion" title="Study Group">
title: Study Group
cast:
  Kim:
    seed: kim_researcher
    openPeeps:
      face: smile
  Alex:
    seed: alex_student
~~~~

Kim: Did you read the Roediger study? Students who took practice tests remembered 50% more after a week.

Alex: That's counterintuitive. You'd think studying more would help more than testing.

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

YAML format before the `~~~~` divider. Uses the same lowercase metadata keys as OLX frontmatter:

```
title: Learning Discussion
author: Education Team
cast:
  Kim:
    seed: kim_researcher
    openPeeps:
      face: smile
  Alex:
    seed: alex_student
~~~~
```

### cast

Define avatar appearance for each speaker in the header. Not every cast member needs options — a bare entry like `Alex:` uses the speaker name as the avatar seed.

```
cast:
  Kim:
    seed: kim_researcher
    openPeeps:
      face: smile
      skinColor: ["694d3d"]
  Alex:
```

Per-line expression overrides use inline metadata:

```
Kim: That's fascinating! [face=awe]
Alex: I'm not so sure. [face=serious]
```

The parser warns on unknown keys and casing mistakes (e.g., `Seed` instead of `seed`).

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

### Rich Content

Indent lines by 2+ spaces for full markdown — paragraphs, lists, tables, code blocks. Inside the indented block, `#`, `[`, and `---` are literal text, not chatpeg syntax.

```
Kim: Here's the summary:

  The results were clear:

  - Testing beats re-reading
  - Spacing beats cramming

  > "Desirable difficulties" — Bjork, 1994

Alex: Got it. [face=smile]
```

See the Chatpeg Grammar Reference for full details.

### Inline Metadata

Annotate any dialogue line with `[key=value]` pairs:

```
Kim: This is a key point. [id=key_finding face=smile]
```

Use `id` for clipping and navigation. Use `face` for per-line expression overrides. Metadata can also appear on a standalone line above dialogue.

### Embeds

Reference other blocks directly in the conversation flow:

```
Kim: Now try this problem.

::problem_1

Kim: How did that go?
```

See the Chatpeg Grammar Reference for full syntax including YAML options and fenced inline OLX.

#### Display Modes

Control how an embedded block is presented using `[display=...]` metadata:

| Mode | Effect |
|------|--------|
| *(none)* | Render inline in the conversation flow |
| `fullscreen` | Wrap in a CompactPopout that opens as a fullscreen modal |
| `window` | Wrap in a CompactPopout that opens as a windowed modal |
| `target:<id>` | Send the block to a target component (e.g., a UseHistory sidebar) |

```
::video_1 [display=fullscreen]
::reference_chart [display=window label="View chart"]
::activity_1 [display=target:sidebar]
```

**Target mode** repoints a component (like UseHistory) to display the embedded block, replacing the set command for embed-specific use cases. The embed does not appear inline — it auto-advances like a set command. Use surrounding dialogue to direct the learner's attention:

```
::problem_1 [display=target:sidebar]
Kim: Take a look at the problem on the right.
```

### Commands

**Pause** — Inserts a hard stop between commands that would otherwise execute together. **Rarely needed.** Each "Continue" click already advances dialogue, so `--- pause ---` is not for progressive reveal between messages. Use it only when consecutive commands must run sequentially with a user confirmation in between:

```
sidebar <- intro_panel
--- pause ---
sidebar <- activity_panel
```

**Wait** — Blocks until a state language expression is truthy:

```
--- wait @component_id.value ---
--- wait @quiz.correct === correctness.correct ---
--- wait wordcount(@essay.value) >= 50 ---
```

See [State Language Expressions](../../../lib/stateLanguage/expr.pegjs.md) for full syntax.

**Set** — Writes a field on a block as the script plays (`destination <- value`). The arrow points *into* the destination, like assignment; the field defaults to `value`, and leading dots scope it to this block (`.field`) or its parent (`..field`). For repointing embeds, prefer `display=target:<id>` (see [Display Modes](#display-modes)); set commands are for general field updates:

```
sidebar <- student_input        # sidebar.value = "student_input"
useElement.target <- choice_b   # explicit field
..mode <- activity              # a field on the parent block
caption.value <- "It's a \"big\" deal.\nLine two."   # quoted, with escapes
```

Place set commands **before** the dialogue that references the new content.

**LLM interlude** — Parks the script and opens the floor to a live LLM participant. The user and the agent converse; the script resumes on Continue, gated by an optional `until` state expression:

```
>>> llm tutor [until="@quiz.correct === correctness.correct" maxTurns=6 tools="content-read"]
  You are a patient Socratic tutor. Ask one guiding question at a time.
  The student's essay so far: {{@essay.value}}
```

The indented block is the agent's system prompt; `{{...}}` interpolations are state language, re-resolved at every turn so the agent sees current state. The participant name (`tutor`) resolves against the cast for its avatar. Metadata:

- `until` — state expression that must be truthy before the script can advance past the interlude (like `wait`, but conversational)
- `maxTurns` — cap on user turns
- `tools` — comma-separated toolset names from the browser tool plane (e.g. `content-read`, `docs`); omit for a plain conversation
- `profile` — reserved for server-side LLM profile selection

The agent always has an `end_conversation` tool, so prompts can delegate the ending: *"We have a target of 5 messages; hard stop at 10. When the student states the idea correctly, congratulate them and call end_conversation."* Calling it says goodbye, closes the input, and resumes the script automatically. The user's exit is the Continue button, allowed when `until` is satisfied, the agent ended the conversation, or `maxTurns` is exhausted (a hard stop never strands the user behind an unsatisfied `until`).

The agent has no script privileges: it cannot run set commands and affects other blocks only through its declared toolsets. Runtime turns are stored in the block's `messages` log field (actor-stamped, append-only), not in the script — the script stays static content.

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
title: Peer Discussion
~~~~

Alex: Before we look at the research, what do you think: is it better to study in one long session or multiple shorter sessions?

--- wait prediction_input ---

Kim: Interesting! Let's see what the research says...

Kim: Cepeda et al. found that spacing study sessions produces dramatically better retention — especially when the spacing matches how long you need to remember.

sidebar <- summary
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
- `messages` — Append-only log of live LLM-interlude turns (`{ atIndex, message }`)

## Pedagogical Applications

Chat supports scenario-based assessments where students join ongoing discussions, contributing analysis that influences how the conversation unfolds. Characters model different perspectives and reasoning approaches. The format increases engagement through social presence while the wait/activity pattern creates natural reflection points.

The predict-then-explain pattern shown above leverages the finding that making predictions improves subsequent encoding of correct information (Roediger &amp; Karpicke, 2006).

## Related Blocks

- **UseHistory** — Displays timeline of student responses
- **Hidden** — Contains activity components referenced by chat
- **SplitPanel** — Common layout with chat and sidebar
- **TextArea** — Student input that chat can wait for
- **TalkBubble** — Static speech bubbles (uses the same Avatar component)
