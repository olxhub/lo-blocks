# ShowAnswerButton

Reveals the expected answer for the grader it sits in.

Attributes are generated from the schema and shown on this block's Overview tab.

## It asks the grader, rather than being told

The text it shows comes from the grader's own `displayAnswer` (or its `answer`
where no display form is given), so a rubric change reaches the button without the
button being edited. That is why it takes no answer of its own — an answer written
here would be a second copy, correct only until the grader changed.

## Related blocks

- **DefaultGrader**, **StringGrader**, and the other graders — where the answer comes from
- **Explanation** — for prose about WHY, as against what the answer is
