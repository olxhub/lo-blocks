# ScrollToAction

Smoothly scrolls the visible rendered copy of a target block into view when its enclosing action fires.

```olx:playground
<Vertical id="scroll_action_demo">
<ActionButton id="show_details" label="Show details">
  <ScrollToAction target="details_destination" block="start" />
</ActionButton>

<Markdown id="overview">
Choose **Show details** to move past this content to the destination.

## Background

Authored navigation is useful when the next relevant content is farther down a long page. This example includes several paragraphs so the movement is visible.

Learners might first read an explanation, inspect an example, and answer a question before an action takes them to feedback or the next step.

The action scrolls the target smoothly and aligns it with the requested part of the viewport. It does not change page state or hide any content.

Because content can be reused, more than one rendered element may carry the same block ID. Only the first visible copy is selected.

This final paragraph provides a little more distance before the destination below.
</Markdown>
<Markdown id="details_destination">## Details

The details are here.</Markdown>
</Vertical>
```

The required `target` is a block ID. `block` controls vertical alignment and accepts `start` (the default), `center`, or `end`. If a block has multiple mounted copies, such as through `Use` or hidden tab panels, only a visible copy is used. A missing or currently hidden target produces a warning and does nothing.
