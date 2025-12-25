# Chat

Conversational learning interface with dialogue, activities, and flow control.

```olx:playground
<Chat id="discussion" title="Study Group">
Title: Study Group
~~~~

Kim: Did you see the Roediger study? Students who took practice tests remembered 50% more after a week.

Alex: That's counterintuitive. You'd think studying more would help more than testing.

--- pause ---

Kim: That's exactly why it's called "desirable difficulty" - it feels harder during practice but produces better long-term retention.
</Chat>
```

## External File Usage

```olx:code
<Chat id="discussion" src="conversation.chatpeg" title="Study Group" />
```

## Chatpeg Format

```
Title: Conversation Title
Author: Optional Author
~~~~

Scene Name
----------

Speaker1: Dialogue line here.

Speaker2: Another line.

# Comments start with hash

--- pause ---

Speaker1: Continues after user clicks.
```

### Header

Key-value pairs before the `~~~~` divider:

```
Title: Learning Discussion
Author: Education Team
Course: PSYCH 101
~~~~
```

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

### Commands

**Pause** - Waits for user to click continue:

```
--- pause ---
```

**Wait** - Blocks until a component has a value:

```
--- wait component_id ---
--- wait quiz1, essay1 ---
--- wait quiz1 correct ---
```

**Arrow** - Repoints a dynamic component to show different content:

```
sidebar -> student_input
```

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

Kim: Cepeda et al. found that spacing study sessions produces dramatically better retention - especially when the spacing matches how long you need to remember.

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

### Clips

A single conversation script can span multiple screens or sections of a course. Write the full dialogue once, then use clips to show specific sections where needed:

```olx:code
<Chat id="ch1" src="full.chatpeg" clip="Introduction" />
<Chat id="ch2" src="full.chatpeg" clip="Main Discussion" history="Introduction" />
```

The `history` attribute provides earlier context so the conversation flows naturally even when split across pages.

## State Fields

- `value` - Current position in dialogue
- `isDisabled` - Whether advance is blocked (waiting)
- `sectionHeader` - Current section title

## Pedagogical Applications

Chat supports scenario-based assessments where students join ongoing discussions, contributing analysis that influences how the conversation unfolds. Characters model different perspectives and reasoning approaches. The format increases engagement through social presence while the wait/activity pattern creates natural reflection points.

The predict-then-explain pattern shown above leverages the finding that making predictions improves subsequent encoding of correct information.

## Related Blocks

- **UseHistory** - Displays timeline of student responses
- **Hidden** - Contains activity components referenced by chat
- **SplitPanel** - Common layout with chat and sidebar
- **TextArea** - Student input that chat can wait for
