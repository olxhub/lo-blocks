# TalkBubble

Displays dialogue with an avatar and speech bubble, perfect for conversation-based SBAs.

```olx:playground
<TalkBubble who="Kim" seed="kim_researcher">
  <Markdown>Have you heard about Mazur's peer instruction? Students discuss with neighbors to improve conceptual understanding.</Markdown>
</TalkBubble>

<TalkBubble who="Alex" side="secondary" seed="alex_student">
  <Markdown>The clicker method? Where students explain their reasoning to peers?</Markdown>
</TalkBubble>

<TalkBubble who="Kim" seed="kim_researcher" face="smile">
  <Markdown>Exactly! It nearly doubles learning gains on conceptual inventories like the FCI.</Markdown>
</TalkBubble>
```

## Attributes

- `who` (optional): Character ID (looked up in cast)
  - Appears above the speech bubble
  - Used as default seed for avatar generation

- `side` (optional): `"primary"` (default) or `"secondary"`
  - Controls which side the avatar appears
  - Primary bubbles have gray background
  - Secondary bubbles have blue background

- `seed` (optional): Override seed for DiceBear avatar generation
  - Same seed always produces the same face
  - Defaults to character ID if not provided
  - Use consistent seeds across TalkBubbles for the same character

- `face` (optional): DiceBear expression override
  - Controls facial expression (e.g., `smile`, `calm`, `awe`, `serious`)

- `avatarStyle` (optional): `"illustrated"` (default) or `"initials"`
  - `illustrated` renders a DiceBear Open Peeps face
  - `initials` renders a colored circle with speaker initials

- `avatar` (optional): Path to custom avatar image
  - Bypasses DiceBear generation entirely
  - Recommended size: 48x48 pixels

- `cast` (optional): Path to a `.cast` YAML file or inline cast object
  - Provides character definitions for avatar rendering
  - Can also be inherited from a parent `<Cast>` block

## Avatar Styles

### Illustrated (default)

DiceBear Open Peeps generates a unique illustrated face from the seed:

```olx:playground
<TalkBubble who="Dr. Aronson" seed="aronson_prof" face="calm">
  <Markdown>The Jigsaw classroom uses structured interdependence to reduce prejudice.</Markdown>
</TalkBubble>

<TalkBubble who="Student" side="secondary" seed="eager_student" face="smile">
  <Markdown>Each student becomes an expert on one piece and teaches the group?</Markdown>
</TalkBubble>
```

### Initials

Colored circles with speaker initials — useful for narrators or system messages:

```olx:playground
<TalkBubble who="System" avatarStyle="initials">
  <Markdown>The following conversation is based on Hake's 1998 study of 6,000 students.</Markdown>
</TalkBubble>
```

## Common Patterns

### Consistent Characters

Use the same `seed` across TalkBubbles to maintain a character's appearance:

```olx:code
<TalkBubble who="Kim" seed="kim_01">
  <Markdown>First message.</Markdown>
</TalkBubble>
<TalkBubble who="Kim" seed="kim_01" face="smile">
  <Markdown>Same face, different expression.</Markdown>
</TalkBubble>
```

### Multi-block Content

```olx:code
<TalkBubble who="Researcher" seed="researcher_01">
  <Markdown>Look at the results from Hake's study:</Markdown>
  <Image src="/images/hake-gains.png" />
  <Markdown>Interactive engagement nearly doubled learning gains.</Markdown>
</TalkBubble>
```

## Design Rationale

TalkBubble creates an engaging, conversation-like interface for:
- **SBA dialogues** — Simulated conversations with embedded activities
- **Case studies** — Present scenarios through character dialogue
- **Interviews** — Show Q&amp;A format content
- **Role-playing** — Support character-based learning

The visual design mimics messaging apps, making it familiar and approachable. For longer or interactive dialogues with flow control, see the **Chat** component which uses the chatpeg format.

## Tips

- Use consistent `seed` values for consistent character appearance
- Alternate `side` between speakers for visual distinction
- Combine with NextReveal for progressive dialogue
- Keep individual messages concise (like real conversation)
- Use Chat instead of TalkBubble for dialogues with pauses, waits, or sidebar activities

## Related Blocks

- **Chat** — Interactive dialogue with flow control (chatpeg format)
- **NextReveal** — Progressive reveal for TalkBubble sequences
