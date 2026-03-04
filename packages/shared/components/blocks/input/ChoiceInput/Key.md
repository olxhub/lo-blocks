# Key

Marks a correct answer option inside `ChoiceInput`. See `ChoiceInput` for full documentation.

## Attributes

- `id`: Unique identifier for this option (auto-generated if omitted)
- `value`: Value stored when selected (defaults to `id` if omitted)

## Usage

### Basic

```olx:code
<ChoiceInput>
  <Key>Retrieval practice improves long-term retention</Key>
  <Distractor>Rereading is the most effective study method</Distractor>
</ChoiceInput>
```

### With Value for Dynamic Content

Value allows avoiding ID conflicts. For example, when integrating with UseDynamic:

```olx:code
<ChoiceInput id="selector">
  <Key id="opt_correct" value="content_testing">Practice Testing</Key>
  <Distractor id="opt_wrong" value="content_highlighting">Highlighting</Distractor>
</ChoiceInput>

<UseDynamic targetRef="selector" target="content_testing" />
```

The `value` attribute lets the choice reference a content ID without ID conflicts.

Graded by `KeyGrader`.

