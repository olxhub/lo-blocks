# UseHistory

Like UseDynamic, but maintains a history of all targets displayed, with navigation controls to move back and forward.

```olx:playground
<Hidden>
  <Markdown id="panel_a">**Panel A**: First content panel</Markdown>
  <Markdown id="panel_b">**Panel B**: Second content panel</Markdown>
  <Markdown id="panel_c">**Panel C**: Third content panel</Markdown>
</Hidden>

<ChoiceInput id="selector">
  <Key value="panel_a">Show A</Key>
  <Distractor value="panel_b">Show B</Distractor>
  <Distractor value="panel_c">Show C</Distractor>
</ChoiceInput>

<UseHistory initial="panel_a" targetRef="selector" />
```

Select different panels, then use the navigation dots to browse your history.

### With Chat Sidebar

```olx:playground
<Hidden>
  <Markdown id="sidebar_intro">Activities will appear here...</Markdown>
  <Vertical id="activity_one">
    <Markdown>**Reflection 1**</Markdown>
    <TextArea id="reflect1" rows="2" placeholder="Your thoughts..." />
  </Vertical>
  <Vertical id="activity_two">
    <Markdown>**Reflection 2**</Markdown>
    <TextArea id="reflect2" rows="2" placeholder="Your thoughts..." />
  </Vertical>
</Hidden>

<SplitPanel sizes="65,35">
  <LeftPane>
    <Chat id="discussion">
Title: Discussion
~~~~

Alex: Let's think about this topic.

sidebar -> activity_one

Kim: Good point! Here's another angle.

sidebar -> activity_two

Alex: That makes sense.
    </Chat>
  </LeftPane>
  <RightPane>
    <UseHistory id="sidebar" initial="sidebar_intro" />
  </RightPane>
</SplitPanel>
```

## Attributes

- `initial`: Initial content to display before any selections
- `targetRef`: ID of component whose `value` determines what to render

## Navigation Controls

UseHistory displays dot indicators for navigating through history:
- Click dots to jump to any point in history
- Use arrows to move forward/backward one step
- New items are added to the end of history

## State Fields

- `value`: Current target ID being rendered
- `history`: Array of all target IDs that have been shown
- `index`: Current position in the history array

## Related Blocks

- **UseDynamic**: Simpler version without history tracking
- **Use**: Static content inclusion
