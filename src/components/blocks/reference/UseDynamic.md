# UseDynamic

Renders a component by ID, where the target can change at runtime. Unlike `<Use ref="id">` which statically includes content, UseDynamic can switch what it displays based on user interaction or other state changes.

## Attributes

- `target`: Default component ID to render (used as initial value or fallback)
- `targetRef`: ID of another component whose `value` determines what to render

## Basic Usage

### Static Target

Render a specific component (similar to Use, but the target is stored in state):

```xml
<UseDynamic target="intro_content" />
```

### Dynamic Target from Input

Render content based on user selection. The `targetRef` points to an input component, and UseDynamic renders whatever ID that input's value contains:

```xml
<ChoiceInput id="topic_selector">
  <Key id="choice_math" value="content_math">Mathematics</Key>
  <Distractor id="choice_science" value="content_science">Science</Distractor>
  <Distractor id="choice_history" value="content_history">History</Distractor>
</ChoiceInput>

<UseDynamic target="content_math" targetRef="topic_selector" />

<Hidden>
  <Markdown id="content_math">Math content here...</Markdown>
  <Markdown id="content_science">Science content here...</Markdown>
  <Markdown id="content_history">History content here...</Markdown>
</Hidden>
```

In this example:
1. The Key/Distractor `value` attributes specify which content ID to use when selected
2. `target="content_math"` provides the initial/default content before any selection
3. `targetRef="topic_selector"` tells UseDynamic to read the ChoiceInput's value
4. When the user selects "Science", the ChoiceInput's value becomes "content_science", and UseDynamic renders that Markdown block

## Use Cases

- **Conditional feedback**: Show different content after grading based on correctness
- **Tab-like interfaces**: Switch between content panels based on selection
- **Multi-step wizards**: Progress through different content as users complete steps
- **Adaptive content**: Display content matched to user choices or preferences

## State Fields

- `value`: The current target ID being rendered (initialized from `target` or `targetRef`)

## Related Blocks

- **Use**: Static content inclusion (target never changes)
- **UseHistory**: Like UseDynamic but maintains history with back/forward navigation
- **Hidden**: Container for content that should exist in the DOM but not display directly
