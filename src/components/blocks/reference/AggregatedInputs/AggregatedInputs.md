# AggregatedInputs

Visual helper block that reads the same Redux field across multiple component IDs. Renders each ID/value pair in a list for quick state auditing during development or debugging.

## Attributes

- `target`: Comma- or space-separated list of component IDs to read
- `field`: Field name to read from each target (default: `value`)
- `fallback`: Value to use when a target does not yet have state (default: empty string)
- `heading`: Optional heading text displayed above the list
- CapaProblem-aware: If you target a `CapaProblem` block, the helper will automatically traverse that problem's children and use the graders it finds instead of the container itself.

## Basic Usage

Render the current `value` field for three inputs:

```olx:code
<AggregatedInputs target="jigsaw_expert, think_pair, stad_team" />
```

Use a different field and a custom heading:

```olx:code
<AggregatedInputs target="grader_a grader_b" field="correct" heading="Grader correctness" />
```

Use a `CapaProblem` ID to automatically inspect its graders:

```olx:code
<AggregatedInputs target="coop_learning_quiz" field="correct" heading="Quiz results" />
```

## Notes

- All targeted components must expose the requested field; otherwise, a clear error is thrown
- When used with graders or other computed components, the block respects each component's `getValue` logic via the normal Redux selectors

