# LineInput Block

## Overview

The LineInput block provides a single-line text input field for short student responses like names, single words, or brief answers. This can be used as an input inside CapaProblem.

## Technical Usage

### Basic Syntax
```xml
<LineInput id="answer" placeholder="Enter your answer" />
```

### Properties
- `id` (recommended): Unique identifier for the input
- `placeholder` (optional): Hint text displayed when empty

### State Fields
- `value`: The current text entered by the student

### getValue
Returns the text string entered by the student.

## Pedagogical Purpose

LineInput supports targeted responses:

1. **Focused Answers**: Single-line limits encourage concise responses
2. **Specific Recall**: Tests particular knowledge items
3. **Quick Input**: Fast response collection for simple questions
4. **Grading Compatibility**: Works well with string-matching graders

## Common Use Cases

### Fill-in-the-Blank
```xml
<Markdown>The capital of France is _______.</Markdown>
<LineInput id="capital_answer" />
```

### Vocabulary Questions
```xml
<Markdown>Define the term "mitosis":</Markdown>
<LineInput id="definition" />
```

### Name/Identifier Entry
```xml
<LineInput id="student_name" label="Your Name" placeholder="Enter your name" />
```

## Example File
See `LineInput.olx` for working examples.
