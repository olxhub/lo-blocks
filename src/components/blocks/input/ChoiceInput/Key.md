# Key

Marks a correct answer option inside `ChoiceInput`. See `ChoiceInput` for full documentation.

## Attributes

- `id`: Unique identifier for this option (auto-generated if omitted)
- `value`: Value stored when selected (defaults to `id` if omitted)

## Usage

### Basic

```xml
<ChoiceInput>
  <Key>Correct answer</Key>
  <Distractor>Wrong answer</Distractor>
</ChoiceInput>
```

### Note: Value

Value allows us to avoid id conflicts. For example, when integrating with UseDynamic, we can use `value` to specify which content to display:

```xml
<ChoiceInput id="selector">
  <Key id="opt_correct" value="content_a">Option A</Key>
  <Distractor id="opt_wrong" value="content_b">Option B</Distractor>
</ChoiceInput>

<UseDynamic targetRef="selector" target="content_a" />
```

The `value` attribute lets the choice reference a content ID without ID conflicts.

Graded by `KeyGrader`.
