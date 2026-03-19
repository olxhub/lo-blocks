# SimpleMatching

A simplified DSL for creating matching exercises. Expands to MatchingInput + MatchingGrader wrapped in a CapaProblem.

## Syntax

### With Optional Title

```
Title Text Here
===============
left term: right definition
left term: right definition
```

The separator line (multiple equals signs) is required when you want a title.

### Without Title (Simple Case)

```
left term: right definition
left term: right definition
```

## Basic Example

```olx:playground
<SimpleMatching>
Photosynthesis: Process by which plants convert light energy into chemical energy
Respiration: Process by which cells release energy from glucose
Osmosis: Movement of water across a semipermeable membrane
</SimpleMatching>
```

## With Title Example

```olx:playground
<SimpleMatching>
Basic Biology Concepts
======================
Photosynthesis: Process by which plants convert light energy into chemical energy
Respiration: Process by which cells release energy from glucose
Osmosis: Movement of water across a semipermeable membrane
</SimpleMatching>
```

## Features

- **Click-to-connect**: Students click dots to select and match items
- **Visual feedback**: Selected items highlight in blue, matched items in green
- **Partial credit**: Each correct match counts toward the score
- **Mouse preview**: A dashed line follows the mouse when selecting
- **Bidirectional matching**: Can match from left to right or right to left
- **1:1 constraint**: Each item can only be matched once
- **Double-click to disconnect**: Click a matched dot twice to break the connection

## Blank Lines

Blank lines in the DSL are ignored, so you can format for readability:

```
Learning Styles
===============
Visual: Learning through images, diagrams, and spatial understanding

Auditory: Learning through listening, discussing, and verbal instruction

Kinesthetic: Learning through physical activity and hands-on experience
```

## Advanced: Add Title Attribute

Pass additional attributes through the `title` attribute to customize the CapaProblem:

```
<SimpleMatching title="Taxonomy of Learning">
...
</SimpleMatching>
```

## Related Blocks

- **MatchingInput**: Full featured matching block with explicit structure
- **MatchingGrader**: Grades matching exercises with partial credit
- **SimpleSortable**: Similar DSL pattern for ordering/sequencing
