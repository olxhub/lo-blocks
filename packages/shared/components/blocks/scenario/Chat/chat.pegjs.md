# Chatpeg Dialogue Format

A human-readable format for writing dialogue-driven scenarios, simulations, and assessments. Chatpeg files are parsed by a PEG grammar and rendered by the Chat component.

## Document Structure

A chatpeg document has two parts separated by a `~~~~` divider:

```
[YAML Header]
~~~~
[Body: dialogue, commands, sections]
```

The header is optional. If omitted, the document starts directly with body content.

## Header

The header uses YAML format before the `~~~~` divider:

```yaml
title: Cognitive Load Theory
author: Learning Design Team
description: An introduction to cognitive load theory
cast:
  Professor Liu:
    seed: liu_professor
    face: calm
  Amara:
    seed: amara_student
~~~~
```

### Standard Header Keys

Uses the same metadata keys as OLX frontmatter (defined in `lib/content/metadata.ts`), plus `cast`:

| Key | Description |
|-----|-------------|
| `title` | Document title |
| `author` | Author name |
| `description` | Brief description of the content |
| `category` | Content category |
| `cast` | Speaker avatar definitions (see below) |

Keys are **lowercase**. The parser warns on unknown keys.

### Cast

Define avatar appearance for each speaker. Not every cast member needs options — a bare entry uses the speaker name as the avatar seed:

```yaml
cast:
  Professor Chen:
    seed: chen_professor
    style: illustrated
    face: calm
    head: grayShort
    skinColor: ["ae5d29"]
  Maya:
    seed: maya_grad
    face: smile
  Narrator:
    style: initials
  Jordan:
```

Property keys are **case-sensitive** — use `seed` not `Seed`. The parser warns on casing mismatches.

#### General Properties

| Property | Description |
|----------|-------------|
| `seed` | String that controls which face is generated. Same seed = same face across sessions. Defaults to the speaker name. |
| `style` | `illustrated` (default — DiceBear Open Peeps) or `initials` (colored circle with letters) |
| `src` | Custom image URL — bypasses DiceBear generation entirely |
| `name` | Display name override (if different from the speaker key) |

#### Face (expressions)

Controls the character's facial expression. Can also be overridden per-line with `[face=...]` metadata.

`angryWithFang`, `awe`, `blank`, `calm`, `cheeky`, `concerned`, `concernedFear`, `contempt`, `cute`, `cyclops`, `driven`, `eatingHappy`, `explaining`, `eyesClosed`, `fear`, `hectic`, `lovingGrin1`, `lovingGrin2`, `monster`, `old`, `rage`, `serious`, `smile`, `smileBig`, `smileLOL`, `smileTeethGap`, `solemn`, `suspicious`, `tired`, `veryAngry`

#### Head (hairstyles)

`afro`, `bangs`, `bangs2`, `bantuKnots`, `bear`, `bun`, `bun2`, `buns`, `cornrows`, `cornrows2`, `dreads1`, `dreads2`, `flatTop`, `flatTopLong`, `grayBun`, `grayMedium`, `grayShort`, `hatBeanie`, `hatHip`, `hijab`, `long`, `longAfro`, `longBangs`, `longCurly`, `medium1`, `medium2`, `medium3`, `mediumBangs`, `mediumBangs2`, `mediumBangs3`, `mediumStraight`, `mohawk`, `mohawk2`, `noHair1`, `noHair2`, `noHair3`, `pomp`, `shaved1`, `shaved2`, `shaved3`, `short1`, `short2`, `short3`, `short4`, `short5`, `turban`, `twists`, `twists2`

#### Accessories

`eyepatch`, `glasses`, `glasses2`, `glasses3`, `glasses4`, `glasses5`, `sunglasses`, `sunglasses2`

Shown with probability `accessoriesProbability` (default 20%). Set to `100` to always show, `0` to hide.

#### Facial Hair

`chin`, `full`, `full2`, `full3`, `full4`, `goatee1`, `goatee2`, `moustache1`, `moustache2`, `moustache3`, `moustache4`, `moustache5`, `moustache6`, `moustache7`, `moustache8`, `moustache9`

Shown with probability `facialHairProbability` (default 10%).

#### Mask

`medicalMask`, `respirator`

Shown with probability `maskProbability` (default 5%).

#### Colors

Colors are hex strings (without `#`). Pass as a YAML list to pick from options, or a single value to fix:

| Property | Default palette |
|----------|----------------|
| `skinColor` | `ffdbb4`, `edb98a`, `d08b5b`, `ae5d29`, `694d3d` |
| `clothingColor` | `e78276`, `ffcf77`, `fdea6b`, `78e185`, `9ddadb`, `8fa7df`, `e279c7` |
| `headContrastColor` | `2c1b18`, `e8e1e1`, `ecdcbf`, `d6b370`, `f59797`, `b58143`, `a55728`, `724133`, `4a312c`, `c93305` |

Example fixing skin color:

```yaml
  Kim:
    seed: kim_01
    skinColor: ["694d3d"]
```

### Divider

Three or more tildes on a line by themselves:

```
~~~~
```

## Dialogue Lines

```
Speaker: Text content here.
```

Speaker names can include letters, numbers, spaces, underscores, and hyphens. Periods are **not** supported in speaker names — use `Professor Liu` rather than `Prof. Liu`.

Multi-line dialogue continues on subsequent lines without a speaker label:

```
Alex: This is a longer message that
continues across multiple lines until
a new speaker or command appears.
```

### Rich Content (Indented Blocks)

For paragraphs, lists, headings, and other rich markdown, indent continuation lines by 2+ spaces. Everything inside the indented block is treated as literal markdown — chatpeg special syntax (`//`, `[metadata]`, `--- commands ---`) does not apply.

```
Kim: Here's what the research shows:

  The results were striking:

  - Testing improved retention by 50%
  - Re-reading only improved it by 20%

  > Roediger & Karpicke, 2006

Alex: Wow, that's a big difference! [face=awe]
```

Rules:

- **2+ leading spaces** mark a line as indented content (the leading spaces are stripped)
- **Single blank lines** within the block are preserved as paragraph breaks
- **Two consecutive blank lines**, a non-indented non-blank line, or end-of-file ends the block
- The speaker's initial text and the indented block are joined with a paragraph break
- Non-indented continuation lines still work as before — indented blocks are optional

Indented content can include anything valid in markdown:

```
Professor Liu: Let me walk you through this:

  # Key Concepts

  There are three main findings:

  1. **Testing effect** — practice tests beat re-reading
  2. **Spacing effect** — distributed study beats massed practice
  3. **Interleaving** — mixing topics beats blocking

  | Study | Effect Size |
  |-------|-------------|
  | Roediger (2006) | d = 0.67 |
  | Cepeda (2006) | d = 0.42 |

  ```python
  # Even code blocks work
  recall_rate = tests_taken * 0.15
  ```

Amara: That table is really helpful. [face=smile]
```

## Inline Metadata

Annotate dialogue lines with `[key=value]` at the end of the line:

```
Kim: I'm excited about this! [face=smile]
Alex: That's surprising. [id=surprise face=awe]
```

| Key | Purpose |
|-----|---------|
| `id` | Unique identifier (used for clipping and navigation) |
| `face` | Override speaker's default expression for this line |
| `emotion` | Emotional state annotation |
| `class` | CSS class for styling |

Values with spaces use quotes: `[id="my section"]`

**Note:** Literal `[` characters in dialogue text are not yet supported on the speaker line — the parser treats `[` as the start of metadata. Until escape support is added (e.g. `\[`), use an indented block for text containing square brackets.

Metadata can also appear on a standalone line above dialogue:

```
[id=intro face=smile]
Kim: Welcome to the study group!
```

## Section Headers

Organize dialogue into named sections:

```
Introduction
------------

Kim: Welcome!

Main Discussion
---------------

Kim: Let's look at the research.
```

A section header is text followed by a line of three or more dashes. Sections can have metadata:

```
Introduction [id=intro]
-----------------------
```

## Embeds

Reference other blocks or include literal OLX inline with the conversation flow.

### Embed by Reference

```
::problem_1
::video_1 [display=fullscreen]
::video_1 [display=fullscreen label="Watch this"]
```

The simplest form is `::ref` where `ref` is the ID of another block. Optional `[key=value]` metadata provides display hints to the renderer.

### Embed with YAML Options

For multiple options, use an indented block (same indentation rules as rich content):

```
::video_1
  display: fullscreen
  label: Watch a video about the Kolb Cycle
```

The indented YAML is returned as a raw string for downstream parsing.

### Fenced Inline OLX

Embed literal OLX between `::` fences:

```
::
<MCQ id="quick_check">
  <Prompt>What is 2+2?</Prompt>
  <Key>4</Key>
</MCQ>
::
```

With metadata:

```
:: [display=expandable]
<Video src="lecture.mp4" />
::
```

### AST Output

```json
{ "type": "EmbedCommand", "ref": "problem_1", "metadata": {}, "options": null }
{ "type": "EmbedCommand", "ref": "video_1", "metadata": { "display": "fullscreen" }, "options": "label: Watch..." }
{ "type": "EmbedBlock", "ref": null, "content": "<MCQ>...</MCQ>", "metadata": {} }
```

## Commands

### Pause

Inserts a hard stop between commands that would otherwise execute together. **Rarely needed.**

Normal flow: each "Continue" click reveals the next batch of dialogue messages and simultaneously executes any commands (sets, embeds, waits) adjacent to them. You do **not** need `--- pause ---` between dialogue lines — the user already clicks Continue to advance.

Use `--- pause ---` only when two commands must run sequentially with a user confirmation in between (e.g., a set command that must visibly complete before a wait command fires).

```
sidebar <- intro_panel

--- pause ---

sidebar <- activity_panel
--- wait @activity.done ---
```

### Wait

Blocks until a state condition is satisfied:

```
--- wait @component_id.value ---
--- wait @quiz.correct === correctness.correct ---
--- wait wordcount(@essay.value) >= 50 ---
```

Multiple waits in sequence act as AND — all must be satisfied before the chat advances.

See [State Language Expressions](../../../lib/stateLanguage/expr.pegjs.md) for full expression syntax.

### Set

Writes a field on a block as the script plays — `destination <- value`. The arrow
points *into* the destination (assignment, not navigation). The field defaults to
`value`, so repointing a `UseHistory` is just:

```
sidebar <- activity_panel
```

An explicit field, and the relative scopes `.field` (this block) and `..field`
(parent block):

```
useElement.target <- choice_b
.mode <- chat
..mode <- activity
```

Values may be a bare token or a quoted string with `\n \t \r \" \\` escapes:

```
caption.value <- "It's a \"big\" deal.\nLine two."
```

Place set commands **before** the dialogue that references the new content:

```
sidebar <- activity_panel

Alex: Now complete this activity.

--- wait activity_input ---
```

## Comments

Lines starting with `//` are ignored:

```
// This won't appear in the chat
```

## Clips

A single chatpeg file can be split across multiple course pages using clips:

```xml
<Chat src="full.chatpeg" clip="Introduction" />
<Chat src="full.chatpeg" clip="Main Discussion" history="Introduction" />
```

The `history` attribute shows earlier sections as read-only context, so the conversation flows naturally even when split.

Clip syntax supports section names, IDs, indices, and ranges:

| Syntax | Meaning |
|--------|---------|
| `"Introduction"` | Entire section by title |
| `section_id` | Element or section by ID |
| `[0, 5]` | Inclusive index range |
| `[intro, conclusion]` | Range between named references |
| `[1,]` | From index 1 to end |

## Complete Example

```
title: Desirable Difficulties
author: Learning Design Team
cast:
  Kim:
    seed: kim_researcher
    face: smile
  Alex:
    seed: alex_student
~~~~

The Testing Effect [id=testing]
-------------------------------

Kim: Did you read the Roediger and Karpicke study?

Alex: The one about practice tests?

Kim: Students who tested themselves remembered about 50% more
after a week, even though they felt less confident during practice.

Alex: That's the "desirable difficulty" idea? [face=awe]

Spacing Effect [id=spacing]
---------------------------

Kim: There's a related finding about spacing.

Alex: You mean not cramming?

Kim: Right. Distributing study over time dramatically improves
retention compared to massing practice into one session.
```

## AST Output

The parser produces a structure with header and body:

```json
{
  "type": "Conversation",
  "header": {
    "title": "...",
    "cast": { ... }
  },
  "body": [
    { "type": "SectionHeader", "title": "...", "metadata": {} },
    { "type": "Line", "speaker": "Kim", "text": "...", "metadata": { "id": "..." } },
    { "type": "PauseCommand" },
    { "type": "WaitCommand", "expression": "@quiz.done" },
    { "type": "ArrowCommand", "source": "sidebar", "target": "panel" }
  ]
}
```

## References

- Roediger, H.L. & Karpicke, J.D. (2006). Test-enhanced learning. *Psychological Science*, 17(3), 249-255.
- Bjork, R.A. (1994). Memory and metamemory considerations in the training of human beings. In *Metacognition*.
- Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*, 12(2), 257-285.
- Kalyuga, S. et al. (2003). The expertise reversal effect. *Educational Psychologist*, 38(1), 23-31.
