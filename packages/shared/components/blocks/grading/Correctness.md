# Correctness

Displays a visual indicator showing the grading status of a response. Shows checkmarks, X marks, or neutral states based on correctness. Inside CapaProblem, it is included automatically. **There are very few reasons a course author would include this directly.**

## Syntax

```olx:code
<Correctness />
```

## Properties
- `id` (optional): Unique identifier

## Visual States
- **Correct**: Green checkmark
- **Incorrect**: Red X
- **Ungraded**: No indicator

## Usage Notes

CapaProblem automatically includes Correctness, so you typically don't need to add it manually. It's primarily useful for custom layouts or advanced use cases outside CapaProblem.

## Related Blocks

- **StatusText**: Shows text feedback from graders
- **CapaProblem**: Container that includes Correctness automatically

