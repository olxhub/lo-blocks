# UseDynamic

Renders a component by ID, where the target can change at runtime. Unlike `<Use ref="id">` which statically includes content, UseDynamic can switch what it displays based on user interaction or other state changes.

## Attributes

- `target`: Default component ID to render (used as initial value or fallback)
- `targetRef`: ID of another component whose `value` determines what to render

## Basic Usage

### Static Target

Render a specific component (similar to Use, but the target is stored in state):

```olx:code
<UseDynamic target="intro_content" />
```

### Dynamic Target from Input

Render content based on user selection:

```olx:playground
<Vertical id="dynamic_demo">
  <Markdown>Select a study strategy to learn more:</Markdown>
  <ChoiceInput id="strategy_selector">
    <Key id="choice_testing" value="content_testing">Practice Testing</Key>
    <Distractor id="choice_spacing" value="content_spacing">Spaced Practice</Distractor>
    <Distractor id="choice_interleaving" value="content_interleaving">Interleaving</Distractor>
  </ChoiceInput>

  <UseDynamic target="content_testing" targetRef="strategy_selector" />

  <Hidden>
    <Markdown id="content_testing">
**Practice Testing** (Effect size: 0.70)

Taking practice tests produces better retention than restudying. The act of retrieving information strengthens memory traces.
    </Markdown>
    <Markdown id="content_spacing">
**Spaced Practice** (Effect size: 0.60)

Distributing study over time beats cramming. Cepeda et al. found optimal spacing is 10-20% of the retention interval.
    </Markdown>
    <Markdown id="content_interleaving">
**Interleaving** (Effect size: 0.60)

Mixing different problem types during practice improves transfer, even though it feels harder than blocked practice.
    </Markdown>
  </Hidden>
</Vertical>
```

In this example:
1. The Key/Distractor `value` attributes specify which content ID to use when selected
2. `target="content_testing"` provides the initial/default content before any selection
3. `targetRef="strategy_selector"` tells UseDynamic to read the ChoiceInput's value
4. When the user selects "Spaced Practice", the ChoiceInput's value becomes "content_spacing", and UseDynamic renders that Markdown block

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

