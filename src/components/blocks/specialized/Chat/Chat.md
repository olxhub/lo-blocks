# Chat

Conversational learning interface with dialogue, activities, and flow control.

## Basic Usage

```xml
<Chat id="discussion" title="Study Group">
Title: Study Group
~~~~

Alex: Ready to review for the exam?

Sam: Let's do it!
</Chat>
```

Or with external file:

```xml
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

### Dialogue

Lines with `Speaker: text` format. Multi-line content continues until the next speaker or command:

```
Alex: This is a longer message that
continues on the next line.

Sam: Got it!
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
```

Multiple prerequisites:

```
--- wait quiz1, essay1 ---
```

With conditions:

```
--- wait quiz1 correct ---
--- wait quiz1 score>=8 ---
```

**Arrow** - Copies a component's value to another (typically UseHistory):

```
student_input -> sidebar
```

## Activities Pattern

To integrate student activities into conversation flow:

1. Define activity components (often in `<Hidden>`)
2. Use arrow command to display in sidebar
3. Use wait command to pause until completed

```xml
<Vertical id="lesson">
  <Hidden>
    <TextArea id="reflection" placeholder="Your thoughts?" />
  </Hidden>

  <SplitPanel sizes="65,35">
    <LeftPane>
      <Chat id="chat" title="Discussion">
Title: Discussion
~~~~

Alex: What do you think about this?

reflection -> sidebar

--- wait reflection ---

Alex: Interesting perspective!
      </Chat>
    </LeftPane>
    <RightPane>
      <UseHistory id="sidebar" />
    </RightPane>
  </SplitPanel>
</Vertical>
```

## Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `id` | Yes | Unique identifier |
| `src` | No | Path to .chatpeg file (alternative to inline) |
| `title` | No | Display title |
| `clip` | No | Show only specific section(s) |
| `history` | No | Include earlier sections as context |

### Clips

Show only part of a conversation:

```xml
<Chat id="ch1" src="full.chatpeg" clip="Introduction" />
<Chat id="ch2" src="full.chatpeg" clip="Main Discussion" history="Introduction" />
```

## State Fields

- `value` - Current position in dialogue
- `isDisabled` - Whether advance is blocked (waiting)
- `sectionHeader` - Current section title

## Pedagogical Applications

Chat supports scenario-based assessments where students join ongoing discussions, contributing analysis that influences how the conversation unfolds. Characters model different perspectives and reasoning approaches. The format increases engagement through social presence while the wait/activity pattern creates natural reflection points. Multiple characters can represent peer learners, experts, or contrasting viewpoints—supporting both Socratic dialogue and collaborative problem-solving pedagogies.

## Related Blocks

- **UseHistory** - Displays timeline of student responses
- **Hidden** - Contains activity components referenced by chat
- **SplitPanel** - Common layout with chat and sidebar
- **TextArea** - Student input that chat can wait for
