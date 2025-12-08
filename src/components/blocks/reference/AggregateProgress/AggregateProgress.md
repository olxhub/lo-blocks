# AggregateProgress

Aggregates correctness across multiple grader blocks and renders a compact progress indicator. It is a concrete example of using `useAggregate` in a reusable block so you can drop it into a problem and watch all of the referenced graders update in real time.

## Behavior

- Accepts explicit targets when you want to override inference.
- Counts fully correct, partially correct, graded, and remaining items and surfaces them in a simple summary row plus a native `<progress>` indicator.

## Attributes

- `label` (optional): Heading text for the indicator (defaults to `"Progress"`).
- `target` (optional): Comma-separated string of component IDs to aggregate.
- `infer` (optional): Override inference direction. Uses the same semantics as `inferRelatedNodes` (`"parents"`, `"kids"`, `true`, `false`).

## Usage


```xml
  <!-- Science question -->
  <CapaProblem id="biology_problem">
    <p>Which organelle is responsible for producing ATP in cells?</p>
    <KeyGrader>
      <ChoiceInput>
        <Distractor>Nucleus</Distractor>
        <Key>Mitochondria</Key>
        <Distractor>Ribosome</Distractor>
        <Distractor>Golgi apparatus</Distractor>
      </ChoiceInput>
    </KeyGrader>
  </CapaProblem>

  <!-- True/False format -->
  <CapaProblem id="tf_problem">
    <p>True or False: The sun revolves around the Earth.</p>
    <KeyGrader>
      <ChoiceInput>
        <Distractor>True</Distractor>
        <Key>False</Key>
      </ChoiceInput>
    </KeyGrader>
  </CapaProblem>
  <AggregateProgress id="aggregate_progress" label="Question progress" target="biology_problem, tf_problem" />
```

Whenever any referenced grader updates its `correct` field, the progress indicator re-renders with the new totals. The accompanying `Correctness` blocks make it clear that real graders are present and emitting correctness values for aggregation.
