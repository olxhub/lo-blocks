# Ref Component

A reference component for accessing values from other blocks in Learning Observer.

## Overview

The `Ref` component provides a clean, flexible way to reference and display values from other blocks. For example, if you would like to include a text a student has written in a text area, `<Ref>` lets you do that. If a student writes a thesis statement, and you'd like to show that when they're writing supporting arguments, `<Ref>` is a nice way to do that. Or if you'd like to do a Mad Libs.

## Basic Usage

### Example usage:
```xml
<TextArea id="student_essay">Write your essay here...</TextArea>
<Ref>student_essay</Ref>
```

This will simply mirror the text the student has written. We can do the same with the `target` attribute:

```xml
<LineInput id="answer">Your answer</LineInput>
<Ref target="answer" />
```

## Advanced Features

### Hidden References

It's possible to include the reference without a visible component by setting `visible` to `false`:

```xml
<Ref target="content" visible="false" />
```

The text will still be extracted for use in LLM prompts or other contexts, but nothing will be rendered.

### Field-Specific Access

By default, Ref calls `getValue()` on the target component. However, you can specify a field to extract instead using the `field` attribute:

```xml
<Ref target="input_field" field="value" />
```

This converts a raw field into a getValue-style value. Many blocks only expose certain data through `getValue()` and don't support arbitrary field access. The `field` attribute lets you bypass `getValue()` and access the underlying field directly.

For example, if a component has both `value` and `state` fields but its `getValue()` only returns the formatted value, you can use `field="state"` to access the state field directly.

### Complex Values (Dictionaries, Arrays)

When the target component's value is a complex type (object, array), Ref converts it to a string representation:

```xml
<TabularMCQ id="survey">...</TabularMCQ>
<Ref target="survey" />
```

**Value formatting rules:**
- Strings and numbers: displayed as-is
- Booleans: converted to "true" or "false"
- Arrays of primitives: joined with ", "
- Objects and complex arrays: JSON stringified (with indentation)

### Code Formatting

Use `format="code"` to render the value in a monospace code block with preserved whitespace. This is useful for displaying JSON or other structured data:

```xml
<Ref target="survey" format="code" />
```

Invalid format values display an error listing the valid options.

### Error Handling

If the target doesn't exist or the field is invalid, Ref displays a helpful error message:

```xml
<Ref target="typo_id" />
<!-- Displays error: Target "typo_id" not found -->

<Ref target="valid_id" field="nonexistent" />
<!-- Displays error: Unknown field "nonexistent" -->
```

This helps course authors catch typos during development.

## Technical Notes

**getValue behavior:**
- Returns a **string** for valid values (all types are formatted)
- Returns an **error object** `{ error: true, message: "..." }` for validation failures

This distinction is important: strings may come from user input, while objects are always system-generated. Downstream code can safely check `typeof value === 'object' && value.error` to detect errors.

## Future Directions

1. **Functional Syntax**: `<Ref>word_count(essay)</Ref>`
2. **Same, with async**: `<Ref>llm_prompt(student_thesis, 'summarize this in 3 bullets')</Ref>`
3. **Concise Notation**: e.g. `<Ref target="block.field" />`

For functional syntax, we'd make a small PEG + evaluator, which is easy, but we'd also need to come up with a transformation registration scheme, not to mention, thinking about async.

For concise notation is hard. `edu.mit.student_thesis` could either be:
* ID="edu.mit" field="student_thesis"; OR
* ID="edu.mit.student_thesis" field="getValue"

We could either introspect and guess, use a different delimiter (e.g. `essay:cursorPosition` or `essay/cursorPosition`) or otherwise.