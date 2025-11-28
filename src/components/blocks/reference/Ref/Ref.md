# Ref Component

A reference component for accessing values from other blocks in Learning Observer.

## Overview

The `Ref` component provides a clean, flexible way to reference and display values from other blocks. For example, if you would like to include a text a student has written in a text area, <Ref> lets you do that. For example, if a student writes a thesis statement, and you'd like to show that when they're writing supporting arguments, <Ref> is a nice way to do that. Or if you'd like to do a Mad Libs.

## Basic Usage

### Example usage:
```xml
<TextArea id="student_essay">Write your essay here...</TextArea>
<Ref>student_essay</Ref>
```

This will simply mirror the text the student has written. We can do the same as:

```xml
<LineInput id="answer">Your answer</LineInput>
<Ref target="answer" />
```

## Advanced Features

### Hidden References

It's also possible to include the reference without a UX component by setting `visible` to `false` (e.g. `<Ref target="content" visible="false" />`). However, text will still be extracted. This can be helpful when e.g. making content for LLMs.

### Field-Specific Access

By default, we call `getValue()` on the target component. However, we can specify a field to extract instead:

```xml
<!-- Future functionality -->
<Ref target="input_field" field="cursorPosition" />
```

This is untested as of this writing -- it worked before the last refactor. If this doesn't work, we should fix it.

## Future Directions

1. **Functional Syntax**: `<Ref>word_count(essay)</Ref>`
2. **Same, with async**: `<Ref>llm_prompt(student_thesis, 'summarize this in 3 bullets')</Ref>`
3. **Concise Notation**: e.g. `<Ref target="block.field" />`

For functional syntax, we'd make a small PEG + evaluator, which is easy, but we'd also need to come up with a transformation registration scheme, not to mention, thinking about async.

For concise notation is hard. `edu.mit.student_thesis` could either be:
* ID="edu.mit" field="student_thesis"; OR
* ID="edu.mit.student_thesis" field="getValue"

We could either introspect and guess, use a different delimieter (e.g. `essay:cursorPosition` or `essay/cursorPosition`) or otherwise.