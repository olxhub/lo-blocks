# TextHighlight

Interactive text highlighting exercise where students select words or phrases.

## Overview

TextHighlight presents text where students click or drag to highlight words. Supports three interaction modes:

- **immediate**: Real-time feedback as students select
- **graded**: Students submit, then see results
- **selfcheck**: Students compare their selections to the answer

## Basic Usage

```olx:code
<TextHighlight id="concepts" mode="immediate" src="cooperative_learning.textHighlight" />
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
Highlight the key elements of Jigsaw classroom:
---
In [Jigsaw], students become [experts] on different [subtopics] and then [teach] their peers.
```

## Modes

### Immediate Mode

Feedback updates as students select. Good for practice and exploration.

```olx:code
<TextHighlight id="practice" mode="immediate" src="exercise.textHighlight" />
```

### Graded Mode

Students make selections, then click "Check" to see results. Supports multiple attempts.

```olx:code
<TextHighlight id="quiz" mode="graded" src="exercise.textHighlight" />
```

### Self-Check Mode

Students make selections, then click "Compare" to see the instructor's answer overlaid.

```olx:code
<TextHighlight id="review" mode="selfcheck" src="exercise.textHighlight" />
```

## Advanced Features

### Labels for Targeted Feedback

Add labels to segments using `|label` syntax:

```
Identify elements of positive interdependence:
---
Johnson & Johnson found that [shared goals|goals] and <<individual competition|competition>> affect outcomes.
---
---
goals: Correct! Shared goals create positive interdependence.
competition: Individual competition typically undermines group learning.
```

### Scoring Rules

Add conditional feedback based on performance:

```
Find the key cooperative learning researchers:
---
[Aronson] developed Jigsaw. [Slavin] studied achievement effects. [Johnson & Johnson] defined essential elements.
---
all: Excellent! You identified all three major researchers.
>1: Good start! There are more influential researchers.
: Review the history of cooperative learning research.
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

Text highlighting appears frequently in standardized assessments (identifying evidence, classifying concepts) and supports active reading strategies. The interaction generates rich learning analytics: systems like Learning Catalytics display heatmaps showing which phrases students highlighted, revealing both common understanding and points of confusion. This aggregate view helps instructors see where the class struggles before discussion begins.

## Related Blocks

- **CapaProblem**: Wrapper for graded exercises
- **Markdown**: For prompt text and instructions

