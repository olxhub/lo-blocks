# TalkBubble

Displays dialogue with an avatar and speech bubble, perfect for conversation-based SBAs.

## Features

- **Avatar Display**: Shows speaker name with colored avatar or custom image
- **Left/Right Positioning**: Alternate speakers by position
- **Auto-generated Avatars**: Creates colored circles with initials when no image provided
- **Flexible Content**: Can contain any block content (typically Markdown)

## Usage

```olx:code
<TalkBubble speaker="Kim">
  <Markdown>Have you heard about Mazur's peer instruction?</Markdown>
</TalkBubble>

<TalkBubble speaker="Alex" position="right">
  <Markdown>The clicker method? Where students discuss with neighbors?</Markdown>
</TalkBubble>

<TalkBubble speaker="Kim">
  <Markdown>Exactly! It improves conceptual understanding by having students explain their reasoning to peers.</Markdown>
</TalkBubble>
```

## Attributes

- `speaker` (optional): Name of the person speaking
  - Appears above the speech bubble
  - Used to generate avatar initials
  - Used to color-code the avatar

- `avatar` (optional): Path to avatar image
  - Displays custom image instead of generated avatar
  - Recommended size: 48x48 pixels (shown at 48x48)

- `position` (optional): `"left"` (default) or `"right"`
  - Controls which side the avatar appears
  - Left bubbles have gray background
  - Right bubbles have blue background

## Styling

- **Left-aligned** (default): Gray background, avatar on left
- **Right-aligned**: Blue background, avatar on right
- **Auto-generated avatars**: Color-coded by speaker name for consistency
- **Responsive**: Adapts to content width (max-width: 2xl)

## Common Patterns

### Peer Instruction Discussion

```olx:code
<TalkBubble speaker="Student A">
  <Markdown>I think the answer is B because momentum is conserved.</Markdown>
</TalkBubble>

<TalkBubble speaker="Student B" position="right">
  <Markdown>But doesn't energy also need to be conserved? Let me think...</Markdown>
</TalkBubble>
```

### Expert Interview

```olx:code
<TalkBubble speaker="Interviewer">
  <Markdown>What made you develop the Jigsaw classroom?</Markdown>
</TalkBubble>

<TalkBubble speaker="Dr. Aronson" position="right" avatar="/avatars/aronson.jpg">
  <Markdown>I was looking for ways to reduce prejudice through structured interdependence...</Markdown>
</TalkBubble>
```

### Multi-block Content

```olx:code
<TalkBubble speaker="Researcher">
  <Markdown>Look at this data from Hake's study:</Markdown>
  <Image src="/images/hake-gains.png" />
  <Markdown>Interactive engagement nearly doubled learning gains!</Markdown>
</TalkBubble>
```

## Design Rationale

TalkBubble creates an engaging, conversation-like interface for:
- **SBA dialogues**: Simulated conversations with activities
- **Case studies**: Present scenarios through dialogue
- **Interviews**: Show Q&A format content
- **Role-playing**: Support character-based learning

The visual design mimics messaging apps, making it familiar and approachable for students.

## Tips

- Use consistent speaker names for consistent avatar colors
- Alternate `position` between speakers for visual distinction
- Combine with NextReveal for progressive dialogue
- Keep individual messages concise (like real conversation)
- Use Markdown for formatting within bubbles

