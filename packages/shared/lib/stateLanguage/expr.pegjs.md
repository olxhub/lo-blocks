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

### Membership (`in`)

Test whether a value is in an array or an object has a key:

```
"optA" in @checkboxes.value          # Is "optA" selected?
"optA" in @cb.value && "optB" in @cb.value  # Both selected?
"name" in @data.value                # Does object have key "name"?
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

### formatDuration

Humanize a number of seconds into words. It is the formatting companion to
the duration syntax authors write in attributes (`idleTimeout="90 seconds"`),
and is also used by `TimedContainer`'s pre-start duration and TimeVisible's
debug readout. (Spelled out
rather than `duration()`, which is already an attribute name on
`TimedContainer` and `Flash`.)

```
formatDuration(@time_drafting.value)    # "12 minutes"
formatDuration(@time_planning.value)    # "45 seconds"
formatDuration(3600)                    # "1 hour"
```

Most useful inside `{{ }}` interpolation in prose:

```
You spent {{formatDuration(@wpj3_time_drafting.value)}} drafting.
```

At most two units appear ("1 hour 30 minutes", never a trailing seconds
count). Values at or below zero — including a timer nobody started — read as
`"0 seconds"`, so a report table needs no `|| 0` guard.

The formatter currently emits English. Locale-aware duration wording remains
future work; do not use it as a localization boundary.

### Math functions

Standard Math methods are available:

```
Math.round(@score * 100)
Math.floor(@x)
Math.ceil(@x)
Math.min(@a, @b)
Math.max(@a, @b)
```

## Array Methods

Array methods work on both `items` bindings (child component lists) and
on array-valued fields accessed via sigil references:

### includes

```
@checkboxes.value.includes("optA")
@checkboxes.value.includes("optA") && @checkboxes.value.includes("optB")
```

For simple membership tests, the `in` operator (see above) is often cleaner.

### every / some

```
items.every(c => c.done === completion.done)
items.some(c => c.correct === correctness.correct)
@list.value.some(x => x > 0)
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

### find / length

```
items.length
@list.value.find(x => x > 10)
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

These identifiers are reserved and cannot be used as block field or
attribute names. The full list is maintained in `keywords.ts`.

**Operators:** `in`

**Enums:** `correctness`, `completion`

**Functions:** `wordcount`, `isFilled`, `text2markdown`, `formatDuration`, `stringMatch`, `numericalMatch`, `Math`, `Object`

**Active array/string methods:** `length`, `every`, `some`, `filter`, `map`, `find`, `includes`, `join`

**Reserved for future use:** `reduce`, `indexOf`, `slice`, `concat`, `sort`, `reverse`, `flat`, `flatMap`, `trim`, `startsWith`, `endsWith`, `split`, `replace`, `toLowerCase`, `toUpperCase`, `keys`, `entries`, `of`, `typeof`, `instanceof`, `not`, `and`, `or`

Block field and attribute names are validated against this list at
registration time. If a name collides, the block definition will throw.

## Technical Notes

The expression language is parsed by `expr.pegjs` and evaluated with a safe evaluator (no `eval`). The grammar produces an AST that can be:
- Evaluated at runtime with component state
- Statically analyzed to extract references
- Used for both conditions (boolean result) and interpolation (any value)
