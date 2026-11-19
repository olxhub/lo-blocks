# FocusAction

Focuses the first focusable descendant of the visible rendered copy of a target block. It checks inputs, textareas, selects, editable regions, and buttons, in document order.

```olx:playground
<Vertical id="focus_action_demo">
<ActionButton id="start_writing" label="Start writing">
  <FocusAction target="response_field" />
</ActionButton>

<Markdown id="instructions">Choose **Start writing** to move to the response field.</Markdown>
<TextArea id="response_field" title="Response" placeholder="Write here..." />
</Vertical>
```

The required `target` is a block ID. Normal browser focus behavior scrolls the focused control into view, so `FocusAction` alone is often sufficient for authored navigation. If the target contains no focusable descendant, its wrapper is focused when the wrapper has a `tabindex`; otherwise the action warns and does nothing. Missing and currently hidden targets also warn without throwing. When multiple copies are mounted through `Use` or hidden tab panels, only a visible copy is used.
