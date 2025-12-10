# DropdownInput

A dropdown select input for choosing from a list of options.

## Usage

### Content-based (PEG parsed)

Options as content, one per line:

```xml
<DropdownInput id="color" placeholder="Pick a color...">
  Red
  Green
  Blue
</DropdownInput>
```

Or comma-separated:

```xml
<DropdownInput id="color">Red, Green, Blue</DropdownInput>
```

With custom values (text|value):

```xml
<DropdownInput id="size">
  Small|s
  Medium|m
  Large|l
</DropdownInput>
```

### With Grading (Open edX style)

Mark correct answers with `(x)` and distractors with `( )`:

```xml
<CapaProblem>
  <KeyGrader>
    <DropdownInput id="sky_color" placeholder="Choose...">
      ( ) Red
      ( ) Green
      (x) Blue
      ( ) Yellow
    </DropdownInput>
  </KeyGrader>
</CapaProblem>
```

Multiple correct answers are supported:

```xml
<DropdownInput id="primary">
  (x) Red
  (x) Blue
  ( ) Orange
  (x) Yellow
</DropdownInput>
```

### Attribute-based

For dynamic options or simpler markup:

```xml
<DropdownInput id="color" options="Red, Green, Blue" />
```

With custom values:

```xml
<DropdownInput id="size" options="Small|s, Medium|m, Large|l" />
```

**Note:** You cannot use both content and `options` attribute - this will raise an error.

## Attributes

| Attribute | Description |
|-----------|-------------|
| `id` | Component ID (required for referencing) |
| `placeholder` | Placeholder text shown when no option is selected |
| `options` | Comma-separated options (alternative to content) |

## Reading the Value

Use `<Ref>` to display the selected value:

```xml
<DropdownInput id="color">Red, Green, Blue</DropdownInput>
<p>Selected: <Ref target="color" /></p>
```

## Fields

- `value` - The currently selected option value

## API (locals)

- `getOptions()` - Returns array of `{ text, value, tag? }` for each option
- `getChoices()` - Returns array of `{ id, tag, value }` for KeyGrader compatibility
