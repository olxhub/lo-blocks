# TextSelectionGrader

Grades a [`TextSelectionInput`](./TextSelectionInput.md): required phrases earn
credit, while plain-text and decoy (`<<...>>`) selections subtract. The
**grader** half of the TextSelection family. Sync and immediate-capable.

```olx:playground
<CapaProblem id="verbs" title="Find the verbs" grade="submit">
  <TextSelectionGrader>
    <TextSelectionInput>
Find the verbs:
---
The dog [runs] quickly. It [barks] and [chases] the car.
---
all: Perfect! You found all three verbs.
>1: Good progress! There are more to find.
: Look for action words.
    </TextSelectionInput>
  </TextSelectionGrader>
</CapaProblem>
```

## How It Works

1. Reads the input's selection (an array of word indices) and its answer key
   via the `getExpectedSelections` local — no re-tokenizing.
2. Scores with subtractive partial credit:
   `score = clamp((requiredFound − wrongSelected) / totalRequired, 0, 1)`.
3. Picks the feedback message from the passage's scoring rules (evaluated
   against the same stats), falling back to an `n/m found` summary.
4. **Correct** when all required are found and nothing wrong is selected;
   **partially correct** in between; **incorrect** at zero.

## Show Answer

`getDisplayAnswer` returns the required phrases (discovered from the static DOM,
like KeyGrader). The input highlights them in the passage on reveal.

## Related Blocks

- **TextSelectionInput**: collects the selection and owns the passage/answer key.
- **TextSelection**: the terse tag that composes the pair.
- **CapaProblem**: wrapper for hand-composed graded exercises.
