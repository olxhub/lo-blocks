# State Language Expressions

Expression language for referencing component state, OLX content, and global variables in conditions and templates.

**Prototype Warning:** We are still figuring this out. Until this stabilizes: (1) This documentation may be out-of-date. (2) Content you build using this may break.

**We are making no commitment to support this syntax in the future.** Something equivalent will be in place if we modigy this, but you will need to adjust your content to match.

## Overview

The state language provides a JavaScript-compatible syntax for:
- **Conditions** - `showWhen`, `doneWhen`, `dependsOn`, wait conditions
- **Interpolation** - Dynamic values in Markdown and prompts (future)

## Sigil References

Use sigils to reference different data sources:

| Sigil | Purpose | Example |
|-------|---------|---------|
| `@` | Component state (Redux) | `@essay.value` |
| `#` | Static OLX content | `#rubric` |
| `$` | Global/RCT variables | `$condition` |

### Component State (@)

Reference runtime values from components:

```
@quiz                    # Full component state
@quiz.value             # Input value
@quiz.correct           # Correctness status
@quiz.done              # Completion status
@essay.value            # TextArea content
```

Field access uses dot notation for nested values:

```
@quiz.correct           # Direct field
@input.value.text       # Nested field
```

### Static Content (#)

Reference OLX content by id:

```
#rubric                 # Content of <Markdown id="rubric">
#instructions           # Any block's text content
```

This is a place the grammar will probably change, since we might want #instructions.text or similar.

### Global Variables ($)

Reference experiment conditions and global state:

```
$condition              # RCT condition ("treatment" or "control")
$userId                 # User identifier
```

### Full Paths

For cross-course or absolute references, use quoted syntax:

```
@"/mit.edu/course/problem3".value
#"/shared/rubrics/essay-rubric"
```

## Operators

Standard JavaScript operators are supported:

### Comparison

```
@quiz.correct === correctness.correct
@quiz.correct !== correctness.incorrect
@score > 0.8
@attempts >= 3
@count <= 10
@value < 100
```

### Boolean

```
@a && @b                # AND
@a || @b                # OR
!@a                     # NOT
(@a || @b) && @c        # Grouping
```

### Arithmetic

```
@x + 1
@correct / @total
@score * 100
@x - @y
```

### Ternary

```
@cond ? @a : @b
$condition === "treatment" ? @treatment.value : @control.value
```

## Built-in Enums

Two enums are available for comparing state values:

### correctness

```
correctness.correct          # Answer is correct
correctness.incorrect        # Answer is incorrect
correctness.partiallyCorrect # Partially correct
correctness.unknown          # Not yet graded
```

### completion

```
completion.notStarted   # No interaction yet
completion.inProgress   # Work started
completion.done         # Completed successfully
completion.skipped      # Explicitly bypassed
completion.closed       # Deadline/attempts exhausted
```

## Functions

### wordcount

Count words in a string:

```
wordcount(@essay.value)
wordcount(@essay.value) >= 100
```

### Math functions

Standard Math methods are available:

```
Math.round(@score * 100)
Math.floor(@x)
Math.ceil(@x)
Math.min(@a, @b)
Math.max(@a, @b)
```

## Aggregation

For working with lists of child components, array methods are supported:

### every / some

```
items.every(c => c.done === completion.done)
items.some(c => c.correct === correctness.correct)
```

### filter

```
items.filter(c => c.correct === correctness.correct).length
items.filter(c => c.correct === correctness.correct).length >= 3
```

### map / join

```
items.map(c => c.value)
items.map(c => c.value).join(", ")
```

### length

```
items.length
```

## Usage Examples

### Wait Conditions (Chat)

Block dialogue until a condition is met:

```chatpeg
--- wait @quiz.correct === correctness.correct ---
--- wait @essay.value ---
--- wait wordcount(@essay.value) >= 50 ---
```

### Visibility (showWhen)

Show content conditionally:

```olx
<Markdown showWhen="@grader.correct === correctness.correct">
Great job! You got it right.
</Markdown>

<Markdown showWhen="@quiz.attemptsRemaining === 0">
Here's the answer...
</Markdown>
```

### Completion (doneWhen)

Define when a component is complete:

```olx
<TextArea id="essay" doneWhen="wordcount(@essay.value) >= 100" />

<MCQ id="quiz" doneWhen="@quiz.correct === correctness.correct || @quiz.attemptsRemaining === 0" />
```

### Prerequisites (dependsOn)

Gate content behind prerequisites:

```olx
<Section dependsOn="@intro.done === completion.done">
  <!-- Only shown after intro is complete -->
</Section>

<Section dependsOn="@reading.done === completion.done && @quiz.done === completion.done">
  <!-- Requires both -->
</Section>
```

## Reserved Words

These identifiers are reserved and cannot be used as field names:

**Enums:** `correctness`, `completion`

**Functions:** `wordcount`, `Math`

**Array methods:** `length`, `every`, `some`, `filter`, `map`, `find`, `includes`, `join`, `reduce`

**Runtime:** `componentState`, `olxContent`, `globalVar`

## Technical Notes

The expression language is parsed by `expr.pegjs` and evaluated with a safe evaluator (no `eval`). The grammar produces an AST that can be:
- Evaluated at runtime with component state
- Statically analyzed to extract references
- Used for both conditions (boolean result) and interpolation (any value)
