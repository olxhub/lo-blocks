# Done

Lets a learner mark a self-directed or otherwise ambiguous activity as complete. The completion state is stored for the learner and can be toggled off again.

```olx:playground
<Vertical id="done_example">
<Markdown>Read this short activity, then mark it complete when you are satisfied that you have finished.</Markdown>
<Done id="reading_complete" align="left" />
</Vertical>
```

## Attributes

| Attribute | Values | Default | Description |
|-----------|--------|---------|-------------|
| `align` | `left`, `center`, `right` | `left` | Horizontal alignment of the control |

## State and value

The `value` field is `false` initially and changes each time the learner toggles the control. It is a boolean available for downstream observation and composition. Marking an activity complete records completion, not correctness; the block does not grade the activity.

## Attribution

This block is based on Open edX's [DoneXBlock](https://github.com/openedx/DoneXBlock), including its completion semantics and sliding switch design.
