# NextReveal

Progressive reveal container that shows children one at a time with Next buttons.

## Features

- **Progressive Disclosure**: Shows content one piece at a time
- **Auto-scroll**: Automatically scrolls to the bottom when revealing new content
- **Free Scrolling**: Users can scroll up to review previous content
- **State Persistence**: Remembers which step the user is on

## Usage

```olx:code
<NextReveal id="peer_instruction">
  <TalkBubble speaker="Instructor">
    <Markdown>Here's a conceptual physics question. Think about it individually first.</Markdown>
  </TalkBubble>

  <CapaProblem id="pretest" title="Acceleration at Peak">
    <KeyGrader>
      <Markdown>A ball is thrown straight up. At the highest point, what is the acceleration?</Markdown>
      <ChoiceInput>
        <Distractor>Zero</Distractor>
        <Key>9.8 m/s² downward</Key>
        <Distractor>9.8 m/s² upward</Distractor>
      </ChoiceInput>
    </KeyGrader>
  </CapaProblem>

  <TalkBubble speaker="Instructor" position="right">
    <Markdown>Now discuss with your neighbor. Convince them of your answer!</Markdown>
  </TalkBubble>

  <TextArea id="discussion_notes" placeholder="What did you discuss?" />
</NextReveal>
```

## Common Use Cases

- **Peer Instruction**: Mazur's think-pair-share with clicker questions
- **SBA Dialogues**: Create conversations with interleaved activities
- **Step-by-step Instructions**: Reveal tutorial steps progressively
- **Guided Discussions**: Present dialogue with reflection points

## Attributes

- `id` (required): Unique identifier for the block

## State

- `currentStep`: Number of children currently revealed (starts at 1)

## Design Rationale

NextReveal provides a more conventional SBA interface than the Chat block. It:
- Allows content authors to precisely control pacing
- Enables mixing dialogue with activities
- Provides a familiar conversation UI pattern
- Maintains scroll history for review

## Tips

- Combine with TalkBubble for dialogue-based SBAs
- Mix content types (text, activities, images) for engagement
- Keep individual steps focused and concise
- Use for scenarios where pacing matters

