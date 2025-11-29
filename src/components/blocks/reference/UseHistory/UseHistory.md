# UseHistory

Like UseDynamic, but maintains a history of all targets that have been displayed, with navigation controls to move back and forward through the history.

## Attributes

- `target`: Default component ID to render
- `targetRef`: ID of another component whose `value` determines what to render
- `initial`: Initial history entry (shown before any dynamic updates)

## Basic Usage

### With Chat Sidebar

UseHistory is commonly used with Chat blocks to show activities that accumulate as a conversation progresses:

```xml
<Hidden>
  <Markdown id="sidebar_intro">Activities will appear here...</Markdown>
  <Vertical id="activity_1">
    <Markdown>**First Activity**</Markdown>
    <TextArea id="response_1" />
  </Vertical>
  <Vertical id="activity_2">
    <Markdown>**Second Activity**</Markdown>
    <TextArea id="response_2" />
  </Vertical>
</Hidden>

<SplitPanel>
  <LeftPane>
    <Chat id="discussion">
      ...conversation that triggers sidebar changes...
      sidebar -> activity_1
      ...more conversation...
      sidebar -> activity_2
    </Chat>
  </LeftPane>
  <RightPane>
    <UseHistory id="sidebar" initial="sidebar_intro" />
  </RightPane>
</SplitPanel>
```

### With Dynamic Input

Like UseDynamic, can follow an input's value:

```xml
<ChoiceInput id="selector">
  <Key id="opt_a" value="panel_a">Panel A</Key>
  <Distractor id="opt_b" value="panel_b">Panel B</Distractor>
</ChoiceInput>

<UseHistory target="panel_a" targetRef="selector" />
```

Each selection adds to the history, allowing users to navigate back to previous views.

## Navigation Controls

UseHistory displays dot indicators and arrow controls for navigating through history:
- Click dots to jump to any point in history
- Use arrows to move forward/backward one step
- New items are added to the end of history

## State Fields

- `value`: Current target ID being rendered
- `history`: Array of all target IDs that have been shown
- `index`: Current position in the history array
- `showHistory`: Whether to display navigation controls (component setting)
- `follow`: Whether to auto-advance to newest items (component setting)

## Use Cases

- **Chat sidebars**: Accumulate activities/exercises as conversation progresses
- **Guided tutorials**: Track progress through steps with ability to review
- **Exploration interfaces**: Let users navigate back to previous content
- **Wizard with review**: Complete steps while maintaining access to earlier ones

## Related Blocks

- **UseDynamic**: Simpler version without history tracking
- **Use**: Static content inclusion
- **Chat**: Often paired with UseHistory for sidebar activities
