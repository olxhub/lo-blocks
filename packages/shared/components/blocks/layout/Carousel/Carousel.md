# Carousel

Browse and select from a list of referenced items with left/right navigation. The Carousel's value is the `title` attribute of the currently-displayed item, making it easy to reference selections in LLM prompts via `<Ref>`.

## Usage

Define items as blocks with `title` attributes, then reference them by ID:

```olx:playground
<Vertical>
  <Hidden>
    <Markdown id="phase_a" title="Surface Learning">
Acquiring new content knowledge, vocabulary, facts, and basic skills. Strategies like direct instruction, worked examples, and rehearsal are most effective here.
    </Markdown>
    <Markdown id="phase_b" title="Deep Learning">
Consolidating and connecting ideas, seeing relationships between concepts, developing conceptual understanding. Strategies like concept mapping, metacognitive reflection, peer discussion, and elaboration work well here.
    </Markdown>
    <Markdown id="phase_c" title="Transfer Learning">
Applying knowledge flexibly to new, unfamiliar situations and contexts. This is the hardest phase and requires learners to detect structural similarities across domains.
    </Markdown>
  </Hidden>
  <Markdown>
John Hattie's **Surface / Deep / Transfer** framework (Hattie &amp; Donoghue, 2016) describes three phases of learning. Browse them below.
  </Markdown>
  <Carousel id="phase" wrap="true">phase_a, phase_b, phase_c</Carousel>
  <Markdown>
A key insight from Hattie's work is that strategies effective at one phase can be ineffective or even counterproductive at another. For example, direct instruction works well for surface learning but doesn't drive deep understanding on its own. Conversely, inquiry-based learning applied too early (before surface knowledge is established) can flounder.

The framework pushes back against the tendency to dismiss surface learning as "mere memorization" — it's a necessary foundation that deep and transfer learning build upon.
  </Markdown>
</Vertical>
```

## Attributes

| Attribute  | Type    | Default | Description |
|------------|---------|---------|-------------|
| `id`       | string  | required | Unique identifier |
| `wrap`     | boolean | false   | Circular navigation (wrap around at ends) |
| `readonly` | boolean | false   | Hide navigation arrows (view-only mode) |
| `src`      | string  | -       | Path to external file containing item IDs |

## ID List Format

Same as MasteryBank. Item IDs can be separated by commas, spaces, tabs, or newlines:

```xml
<Carousel id="items">item_a, item_b, item_c</Carousel>
```

## Value

The Carousel's value is the `title` attribute of the currently-displayed item. Access it with `<Ref>`:

```xml
You selected: <Ref target="phase" />
```

## Readonly Mode

Set `readonly="true"` to hide navigation arrows (view-only). Can be set statically or dynamically via SetFieldAction:

```xml
<SetFieldAction target="phase" field="readonly" value="true" />
```
