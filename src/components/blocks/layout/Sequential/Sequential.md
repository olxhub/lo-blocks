# Sequential Block

## Overview

The Sequential block creates a step-by-step learning experiences where learners navigate through content in a linear sequence. However, learners can skip around. This block is analogous to the same block in Open edX.

## Technical Usage

### Basic Syntax
```xml
<Sequential id="mySequence">
  <Step1Content />
  <Step2Content />
  <Step3Content />
</Sequential>
```

### OLX Properties
- `id` (required): Unique identifier for the sequence

### State
- Navigation is automatically handled with prev/next controls
- Current step `index` is maintained in component state to preserves learner progress

## Common Use Cases

### 1. Tutorial Sequences
Guide learners through multi-step processes with explanations and practice at each stage.

### 2. Problem-Solving Scaffolds
Break complex problems into smaller sub-problems, providing support at each level.

### 3. Concept Building
Introduce foundational concepts first, then build complexity progressively.

### 4. Assessment Preparation
Structure review sessions with spaced practice and feedback.

### 5. Active learning
Integrate small assessments and activities into a monolithic text or video. This can be, for example:

* Good: Simple fact-check questions (moving to active learning)
* Better: Students completing steps of a derivation or otherwise taking time to figure out parts of what's being presented.
* Best: Full-fledged learning through e.g. a series of Socratic-style leading questions (commonly, with obvious answers), instead of presentation, where students are actively engaged in all aspects of the learning process

### 6. Scenario-based assessments (activities?)

SBAs structure learning around a common context, where students successively engage with that context.

## Example File
See `Sequential.olx` for a complete working example demonstrating basic usage, interactive content, and layout integration.