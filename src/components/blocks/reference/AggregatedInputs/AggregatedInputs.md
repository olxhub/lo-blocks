# AggregatedInputs

Visual helper block that shows how to read the same Redux field across multiple component IDs.
It calls `AggregatedInputs` under the hood and renders each ID/value pair in a list so you can
audit state quickly while developing or debugging.

## Attributes

- `target`: Comma- or space-separated list of component IDs to read
- `field`: Field name to read from each target (default: `value`)
- `fallback`: Value to use when a target does not yet have state (default: empty string)
- `heading`: Optional heading text displayed above the list
- CapaProblem-aware: If you target a `CapaProblem` block, the helper will automatically
  traverse that problem's children and use the graders it finds instead of the container
  itself.

## Basic Usage

Render the current `value` field for three inputs:

```xml
<AggregatedInputs target="input_one, input_two, input_three" />
```

Use a different field and a custom heading:

```xml
<AggregatedInputs target="grader_a grader_b" field="correct" heading="Grader correctness" />
```

Use a `CapaProblem` ID to automatically inspect its graders:

```xml
<AggregatedInputs target="capa_problem" field="correct" heading="Problem grader correctness" />
```

## Notes

- All targeted components must expose the requested field; otherwise, a clear error is thrown
- When used with graders or other computed components, the block respects each component's
  `getValue` logic via the normal Redux selectors
