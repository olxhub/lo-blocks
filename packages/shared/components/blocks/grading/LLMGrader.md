# LLMGrader

Grades free-form answers with an LLM against a rubric. This is a **slow
(async) grader**: on submit, the problem shows a pending (⏳) state and locks
its inputs while the LLM call is in flight, then updates to the verdict when
grading lands.

## Attributes

- `question` — the question being asked (context for the grader)
- `rubric` — grading criteria the LLM applies
- `answer` — optional reference answer (standard grader attribute)

## Notes

- The LLM returns a verdict (`correct` / `partiallyCorrect` / `incorrect`),
  a 0–1 score, and one or two sentences of feedback shown to the learner.
- Network or parse failures grade as `invalid` (not `incorrect`): the answer
  was never judged, and the attempt is not counted.
