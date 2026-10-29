# SpacedRepetition

A flashcard deck. Each child block is a card. The deck shows one card at a time, watches whether the learner answers it correctly, and uses a scheduling algorithm to decide when that card comes back. Cards answered correctly come back less and less often; cards answered wrongly come back soon. Schedules are saved per learner, so a deck can be studied over days or weeks.

This puts two of the best-replicated findings in learning science to work: the **spacing effect** (study spread over time beats the same study crammed together, first measured by Ebbinghaus in 1885) and the **testing effect** (recalling an answer strengthens memory more than rereading it).

```olx:playground
<SpacedRepetition id="spacingDemo" baseInterval="30 seconds">

<CapaProblem id="spacingDemoEbbinghaus" title="The forgetting curve" dontKnow="true">
In what year did Hermann Ebbinghaus publish his forgetting curve?
<NumericalGrader id="spacingDemoEbbinghausGrader" answer="1885">
  <NumberInput id="spacingDemoEbbinghausInput" />
</NumericalGrader>
</CapaProblem>

<MarkupProblem id="spacingDemoRetrieval" title="Retrieval practice" dontKnow="true"><![CDATA[
>>Which study strategy produces better retention a week later?<<

( ) Rereading the material
(x) Practicing recall from memory
]]></MarkupProblem>

</SpacedRepetition>
```

## Attributes

| Attribute      | Type     | Default     | Description |
|----------------|----------|-------------|-------------|
| `algorithm`    | `"leitner"` | `"leitner"` | Scheduling algorithm (see below) |
| `boxes`        | integer  | `5`         | Leitner: number of boxes |
| `baseInterval` | duration | `"1 day"`   | Leitner: wait after a card lands in box 1. Each higher box doubles it. Accepts `"10 minutes"`, `"1 hour 30 minutes"`, `"2 days"`, or seconds |

With the defaults, a new card is shown right away and, while it keeps being answered correctly, again after 2, 4, 8 and then every 16 days. A miss sends it back to box 1, due again in 1 day. Short intervals such as `"1 minute"` are handy for demos and for testing a deck.

## How it works

* **Cards.** Every child block is a card, in authored order. Cards must be problems that report a grade: `CapaProblem`, `MarkupProblem`, or any grader. Any other child (a `Markdown` block, say), a card with `when=`, or two cards with the same `id` is an authoring error; put instructions outside the deck.
* **Fresh presentations.** Each time a card is shown, it is rendered in a new state scope (`deck:card:#rep_N`), so inputs start empty and the learner retrieves the answer again rather than seeing the last one.
* **Observing answers.** The deck reads the card's grade with `useGradingState`. The first graded result of a presentation counts: `correct` is a success; `incorrect` and `partiallyCorrect` are failures. Unsubmitted, pending, invalid, and incomplete answers are ignored. The learner may keep working on the card afterwards; it does not change the schedule.
* **Don't know.** Give cards `dontKnow="true"` (a `CapaProblem` / `MarkupProblem` attribute) so learners who cannot recall an answer can reveal it instead of guessing. Guessing rehearses wrong associations. A give-up is recorded as `gaveUp`. Only the first graded result counts, so a wrong answer followed by a give-up is recorded as `incorrect`, though the problem itself reports `gaveUp`.
* **Choosing a card.** Among cards that are due, the deck picks the lowest box, then the one due earliest, then the first in authored order. New cards are due immediately.
* **Nothing due.** The deck says when the next card is due and offers **Study ahead**, which shows the card due soonest. That review is recorded like any other. The deck also wakes up on its own when the next card falls due.
* **Changing the deck.** Adding a card schedules it as new. Removing a card discards its schedule. Cards are tracked by `id`, so renaming a card's `id` restarts it.

## State

| Field     | Contents |
|-----------|----------|
| `cards`   | `{ [cardId]: { algorithm, reps, state } }`. `reps` counts reviews; `state` belongs to the scheduler (for Leitner, `{ box, dueAt }` with `dueAt` in epoch milliseconds) |
| `current` | `{ cardKey, rep, result, at }`: the card on screen (`null` when nothing is due), the presentation counter, the recorded result, and when it was chosen |

Both fields are written as whole values, so replaying the event stream reproduces the schedule exactly.

## Scheduling algorithms

Schedulers live in `SpacedRepetition/schedulers/`. Each is a pure module implementing:

```ts
interface Scheduler<S> {
  name: string;
  initCard(now: number): S;                  // state for a new card
  isDue(card: S, now: number): boolean;
  dueAt(card: S): number;                    // epoch ms
  priority(card: S): number;                 // lower is reviewed first
  record(card: S, result: 'correct' | 'incorrect' | 'gaveUp', now: number): S;
}
```

By default, results are ordered `incorrect < gaveUp < correct`: a wrong answer often signals a misconception to overcome, and a "Don't know" does not. This is the project's default ordering; schedulers and contexts may legitimately differ. A learner who struggles with an olympiad problem and gets it wrong is ahead of one who glances at it and gives up. In physics, a wrong answer may be an execution slip rather than a misconception, so which wrong answer was given matters.

`now` is always passed in; schedulers never read the clock, which keeps them deterministic and easy to test. Per-card state must be plain JSON.

### Leitner

Sebastian Leitner's 1972 card-box system. Cards start in box 1. A correct answer moves a card up one box (it stays in the top box once there); a wrong answer or a "Don't know" sends it back to box 1. A card in box *k* is due `baseInterval × 2^(k−1)` after its last review.

### Adding an algorithm

1. Write `schedulers/myalgorithm.ts` exporting a factory that takes the block's attributes and returns a `Scheduler`.
2. Register it in `schedulers/index.ts`. The `algorithm` attribute accepts every registered name.
3. Add a unit test beside it.

Switching a deck's `algorithm` restarts every card's schedule, since schedulers' state is not interchangeable.

SM-2 (the SuperMemo/Anki family) is the natural next one. It expects a 0–5 recall quality, so until graders report confidence it would map results onto fixed qualities: `incorrect` lowest, `gaveUp` above it, `correct` highest. SM-2's own convention rates a blank below a wrong answer; the default ordering here does not.

## Limitations

* **Three outcomes only.** Right, wrong, or "Don't know"; there is no "easy / hard" rating, and partial credit counts as wrong.
* **The card must be on screen to be recorded.** The deck notices grades while it is displaying the card.
* **Problems with `grade="immediate"`** grade on every change, so the first wrong selection counts as the result.
* **Old presentations stay in state.** Each presentation leaves its answers under its own scope; nothing cleans them up.
* **Clock.** Scheduling uses the learner's device clock.

## Related

* **MasteryBank**: repeat problems until the learner gets several right in a row
* **Sequential**: step through content in order
