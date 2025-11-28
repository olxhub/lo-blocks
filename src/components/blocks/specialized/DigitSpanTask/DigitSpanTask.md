# DigitSpanTask Block

## Overview

The DigitSpanTask block implements a digit span memory test, a classic cognitive assessment used to measure working memory capacity. In this task, participants hear a sequence of digits spoken aloud and must recall them according to a specified rule.

Digit span tasks have been a cornerstone of cognitive assessment since the late 19th century and remain central to modern intelligence testing. The Wechsler Intelligence Scale for Children (WISC) and Wechsler Adult Intelligence Scale (WAIS) both include digit span subtests as part of their Working Memory Index. These tests appear in clinical neuropsychology for assessing conditions ranging from ADHD to traumatic brain injury, and in educational settings for identifying learning disabilities and giftedness.

The task's elegance lies in its simplicity: by varying just two parameters—sequence length and recall direction—it can probe different aspects of working memory. Forward recall primarily measures the phonological loop, while backward recall additionally engages the central executive for mental manipulation. The ascending (sequencing) variant, added in recent WISC editions, requires both holding information and performing operations on it.

## Technical Usage

### Basic Syntax
```xml
<DigitSpanTask id="memory_test" mode="forward" />
```

### Properties
- `id` (required): Unique identifier
- `mode` (optional): Task variant—`forward`, `backward`, or `ascending`

### Modes
- **Forward**: Repeat digits in presentation order (hear "4, 7, 2" → type "472")
- **Backward**: Repeat in reverse order (hear "4, 7, 2" → type "274")
- **Ascending**: Reorder from smallest to largest (hear "4, 7, 2" → type "247")

### Difficulty Adaptation

The current implementation uses a simple adaptive algorithm: sequence length increases after correct responses and decreases after errors. A future goal is to implement proper Item Response Theory (IRT) or Rasch Model-based adaptive testing, where item difficulty parameters are calibrated and ability estimates (theta) are computed using maximum likelihood or Bayesian methods.

### State Fields
- `sequence`: Current digit sequence
- `userInput`: Participant's typed response
- `step`: Task phase (waiting, playing, answering, feedback)
- `theta`: Rough ability estimate (placeholder for future IRT implementation)
- `difficulty`: Current sequence length

## Example

```xml
<DigitSpanTask id="forward_span" mode="forward" />
```

## Example File
See `DigitSpanTask.olx` for working examples.
