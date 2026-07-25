# TextSelectionGrader

Grades a [`TextSelectionInput`](./TextSelectionInput.md): required phrases earn
credit, while plain-text and decoy (`<<...>>`) selections subtract. The
**grader** half of the TextSelection family. Sync and immediate-capable — it
works in both `grade="submit"` and `grade="immediate"` problems.

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
2. Tallies the selection into stats (see below) and computes a score.
3. Picks the feedback message from the passage's scoring rules (evaluated
   against the same stats), falling back to an `n/m found` summary.

## Scoring semantics

The grader tallies a stored selection against the answer key into three numbers:

- **requiredFound** — required segments where *every* word is selected. A
  two-word required phrase needs both words.
- **totalRequired** — the number of required segments in the passage.
- **wrongSelected** — the penalty pool, counted per *contiguous mistake*: each
  unbroken run of selected **plain-text** words counts once (a careless five-word
  drag is one error, not five), and each **feedback-trigger** (`<<...>>`) segment
  with any word selected counts once. Weighing both error kinds the same way
  keeps an incidental drag from outweighing a deliberately planted decoy.
  **Optional** (`{...}`) segments never count, either way.

Score is subtractive partial credit:

```
score = clamp((requiredFound − wrongSelected) / totalRequired, 0, 1)
```

The subtraction is the point: it stops "select every word" from earning full
credit, which the earlier prototype's `found / required` formula allowed.

Correctness follows from the stats:

- **Correct** — all required found and nothing wrong selected (`complete`).
- **Partially correct** — any score strictly between 0 and full.
- **Incorrect** — score of zero.

Two boundary cases short-circuit to *unsubmitted* (nothing to grade): a passage
with no required segments (free selection), and an empty selection (so immediate
mode doesn't flash red before the learner has answered).

## Scoring rules

The passage's optional third section maps conditions to feedback messages,
evaluated top-to-bottom against the same stats; the first match wins. If no rule
matches (or there are none), the grader falls back to an `n/m found` summary
(a complete answer with no matching rule shows no message — the correctness icon
says it).

```
all: You found them all!
found>=2: Almost - two or more correct.
>1,errors<1: On the right track.
: Keep looking.
```

Condition grammar:

| Condition | Matches when |
|-----------|--------------|
| `all` | every required found **and** no errors |
| `found>=2`, `errors<1`, `incorrect=0` | one comparison on a field |
| `>1` | shorthand for `found>1` (bare number defaults to `found`) |
| `>1,errors<1` | comma-separated conjunction (all parts must hold) |
| `` (empty, a bare `:`) | always — the fallback rule |

Fields: `found` (= requiredFound), `errors` and `incorrect` (both =
wrongSelected). Operators: `>`, `<`, `>=`, `<=`, `=`.

## Show Answer

`getDisplayAnswer` returns the required phrases, discovered from the static DOM
(the same way KeyGrader / CheckboxGrader do — the grader's props come from the
static tree, so there is no rendered DOM to walk). The input highlights them in
the passage on reveal.

## Attributes

| Attribute | Required | Default | Description |
|-----------|----------|---------|-------------|
| `target` | No | nested input | State key of the input to grade (auto-wired when nested) |

The `gradeMode` attribute is stamped by the enclosing problem at parse time; you
don't set it by hand.

## Related Blocks

- **TextSelectionInput**: collects the selection and owns the passage/answer key.
- **SimpleTextSelection**: the terse tag that composes the pair.
- **CapaProblem**: wrapper for hand-composed graded exercises.
