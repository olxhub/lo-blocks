# TextHighlight

Interactive text highlighting exercise where students select words or phrases.

## Overview

TextHighlight presents text where students click or drag to highlight words. Supports three interaction modes:

- **immediate**: Real-time feedback as students select
- **graded**: Students submit, then see results
- **selfcheck**: Students compare their selections to the answer

## Basic Usage

```xml
<TextHighlight id="nouns" mode="immediate" src="nouns.textHighlight" />
```

The `src` attribute points to a `.textHighlight` file containing the exercise content.

## Content Format

TextHighlight uses a simple markup syntax in `.textHighlight` files:

```
Prompt text goes here
---
Regular text with [required words] and {optional words} marked.
```

### Segment Types

| Syntax | Type | Meaning |
|--------|------|---------|
| `[word]` | Required | Must be selected for full credit |
| `{word}` | Optional | Correct but not required |
| `<<word>>` | Feedback trigger | Incorrect - triggers specific feedback |
| plain text | Neutral | Should not be selected |

### Example Content File

```
Highlight all the nouns:
---
The [student] went to the [park] with their [friends].
```

## Modes

### Immediate Mode

Feedback updates as students select. Good for practice and exploration.

```xml
<TextHighlight id="practice" mode="immediate" src="exercise.textHighlight" />
```

### Graded Mode

Students make selections, then click "Check" to see results. Supports multiple attempts.

```xml
<TextHighlight id="quiz" mode="graded" src="exercise.textHighlight" />
```

### Self-Check Mode

Students make selections, then click "Compare" to see the instructor's answer overlaid.

```xml
<TextHighlight id="review" mode="selfcheck" src="exercise.textHighlight" />
```

## Advanced Features

### Labels for Targeted Feedback

Add labels to segments using `|label` syntax:

```
Identify positive reinforcement:
---
They used [giving rewards|reward] and <<yelling|yell>> as strategies.
---
---
reward: Correct! Adding something pleasant increases behavior.
yell: Careful - yelling is actually punishment, not reinforcement.
```

### Scoring Rules

Add conditional feedback based on performance:

```
Find the key concepts:
---
[Reinforcement] increases behavior. [Punishment] decreases it.
---
all: Perfect! You found all key concepts.
>1: Good start! Keep looking.
: Review the definitions and try again.
```

Scoring conditions:
- `all` - All required segments selected, no errors
- `>N` - More than N correct
- `<N` - Fewer than N correct
- `=N` - Exactly N correct
- `>N,errors<M` - Compound conditions

## Attributes

| Attribute | Required | Default | Description |
|-----------|----------|---------|-------------|
| `id` | Yes | - | Unique identifier |
| `src` | Yes | - | Path to .textHighlight file |
| `mode` | No | `immediate` | One of: `immediate`, `graded`, `selfcheck` |
| `showRealtimeFeedback` | No | `false` | Show correct/incorrect colors during selection |

## State Fields

- `value` - Array of selected word indices
- `attempts` - Number of check attempts (graded mode)
- `feedback` - Current feedback message
- `showAnswer` - Whether answer is revealed (selfcheck mode)
- `checked` - Whether graded mode has been checked

## Visual Feedback

After checking (graded) or revealing (selfcheck):

- **Green background**: Correctly selected required word
- **Yellow background**: Correctly selected optional word
- **Red background**: Incorrectly selected neutral word
- **Dashed border**: Missed required/optional word

## Pedagogical Applications

Text highlighting appears frequently in standardized assessments (identifying evidence, classifying concepts) and supports active reading strategies. In one psychology course, students used highlighting to identify key claims in readings they would later cite in essays—making the highlighting personally meaningful rather than abstract. The interaction generates rich learning analytics: systems like Learning Catalytics display heatmaps showing which phrases students highlighted, revealing both common understanding and points of confusion. This aggregate view helps instructors see where the class struggles before discussion begins.

## Related Blocks

- **CapaProblem**: Wrapper for graded exercises
- **Markdown**: For prompt text and instructions
