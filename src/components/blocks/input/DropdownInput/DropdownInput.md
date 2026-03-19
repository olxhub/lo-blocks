# DropdownInput

A dropdown select input for choosing from a list of options.

```olx:playground
<Vertical id="dropdown_demo">
  <Markdown>Which study strategy has the highest effect size according to Dunlosky et al. (2013)?</Markdown>
  <DropdownInput id="strategy" placeholder="Select a strategy...">
    Highlighting
    Rereading
    Practice testing
    Summarization
  </DropdownInput>
  <Markdown>**You selected:**</Markdown>
  <Ref target="strategy" />
</Vertical>
```

## Usage

### Content-based (PEG parsed)

Options as content, one per line:

```olx:playground
<DropdownInput id="spacing" placeholder="Choose...">
  Same-day review
  Next-day review
  Weekly review
  Monthly review
</DropdownInput>
```

Or comma-separated:

```olx:playground
<DropdownInput id="effect">Low utility, Moderate utility, High utility</DropdownInput>
```

With custom values (text|value):

```olx:playground
<DropdownInput id="interval">
  Review tomorrow|1day
  Review in one week|1week
  Review in one month|1month
</DropdownInput>
```

### With Grading

Mark correct answers with `(x)` and distractors with `( )`:

```olx:playground
<CapaProblem id="graded_dropdown" title="Study Strategies">
  <KeyGrader>
    <Markdown>Which strategy did Dunlosky et al. rate as having "high utility" for learning?</Markdown>
    <DropdownInput id="rated" placeholder="Choose...">
      ( ) Highlighting
      ( ) Rereading
      (x) Distributed practice
      ( ) Summarization
    </DropdownInput>
    <Explanation>
      **Distributed practice** (spacing) was rated high utility. Highlighting and rereading were rated low utility despite being popular among students.
    </Explanation>
  </KeyGrader>
</CapaProblem>
```

Multiple correct answers are supported:

```olx:playground
<DropdownInput id="high_utility">
  (x) Practice testing
  (x) Distributed practice
  ( ) Highlighting
  ( ) Rereading
</DropdownInput>
```

### Attribute-based

For dynamic options or simpler markup:

```olx:playground
<DropdownInput id="gain" options="Low gain (< 0.3), Medium gain (0.3-0.5), High gain (> 0.5)" />
```

**Note:** You cannot use both content and `options` attribute - this will raise an error.

## Attributes

| Attribute | Description |
|-----------|-------------|
| `id` | Component ID (required for referencing) |
| `placeholder` | Placeholder text shown when no option is selected |
| `options` | Comma-separated options (alternative to content) |

## Fields

- `value` - The currently selected option value

## API (locals)

- `getOptions()` - Returns array of `{ text, value, tag? }` for each option
- `getChoices()` - Returns array of `{ id, tag, value }` for KeyGrader compatibility

