# ChoiceInput

Creates multiple choice questions using Key (correct) and Distractor (incorrect) options. Renders as radio buttons for single-selection.

```olx:playground
<CapaProblem id="scaffolding" title="Instructional Strategies">
  <KeyGrader>
    <Markdown>Which instructional strategy involves breaking complex tasks into smaller, manageable steps with temporary support?</Markdown>
    <ChoiceInput>
      <Distractor>Direct instruction</Distractor>
      <Key>Scaffolding</Key>
      <Distractor>Discovery learning</Distractor>
      <Distractor>Rote memorization</Distractor>
    </ChoiceInput>
  </KeyGrader>
</CapaProblem>
```

## Properties
- `id` (recommended): Unique identifier for the input
- `reverseCoded` (`"true"`/`"false"`, default `false`): Mark this item
  **reverse-coded** — the psychometric sense: agreeing with it means the
  opposite of agreeing with the rest of the scale. The [default-code
  table](#default-codes) is negated for this item's options, so a reversed
  Likert item needs no per-option `code=` at all. Recording only; it is not a
  score and not a grade. See [Reverse-coded items](#reverse-coded-items).

## Child Blocks
- **Key**: Correct answer option(s) - supports optional `value` and `code` attributes
- **Distractor**: Incorrect answer options - supports optional `value` and `code` attributes

## State
- `value`: The selected option's value
- `code`: The selected option's numeric [code](#codes) — `undefined` when nothing is
  selected, or when the selected option has no code

## API (locals)
- `getChoices()`: Returns array of all options with `{ tag, value, code }` for each

## Codes

An option may carry a `code` — the number the response is **recorded** as:

```olx:code
<Key value="agree" code="-1">Agree</Key>
```

> **A code is not a score.** `code` is the survey-methodology sense of the
> word: the SPSS code, the Qualtrics "recode value", the number that goes in
> the column when a response becomes data. It is not a grade, not points, not
> partial credit, and it has nothing to do with `correct`, `score`, or the
> rest of the platform's grading vocabulary. A `Distractor` may carry a code
> as happily as a `Key`, and a Likert instrument — which has no right answer
> at all — is codes from top to bottom.

A code must be a finite number (`-2`, `0`, `1.5`); anything else is a parse
error. Read the selected option's code back with `@inputId.code`.

### Default codes

An option with no `code` falls back to a small table of conventional values
(`defaultCodes.ts` in this directory), matched case-insensitively with spaces
and underscores treated alike:

| value | code | | value | code |
| --- | --- | --- | --- | --- |
| `true`, `yes` | 1 | | `strongly_agree` | 2 |
| `false`, `no` | 0 | | `agree`, `somewhat_agree` | 1 |
| `neutral` | 0 | | `disagree`, `somewhat_disagree` | -1 |
| | | | `strongly_disagree` | -2 |

A value the table does not know has no code, and `@inputId.code` reads
`undefined` rather than a guessed number. An explicit `code` always wins; when
an explicit code disagrees with the effective default, the parser prints a
warning (a likely typo) and uses the explicit code anyway.

Nothing is exempt from that warning, **including a flipped sign** — a dropped
minus in a column of signed numbers is the easiest typo there is, and the one
the guard is best placed to catch. A reversal is declared on the item instead,
with `reverseCoded`, and the warning is measured against the negated table
from then on.

The table is a breadcrumb toward inferring more of an option from less
authoring — see `INFERENCE.md` in this directory for the intended chain and
what is missing today. Content that cares about its numbers should write
`code=` explicitly: the content file is the record of what the numbers mean.

### Reverse-coded items

Codes exist so that a reversed item can be reversed **on the item**, once,
instead of in every consumer of the data. `reverseCoded="true"` says the item
is reverse-coded and negates the default table for its options — `agree` →
-1, `strongly_disagree` → 2 — so a reversed Likert item needs no per-option
`code=` at all. Both items below store the learner's literal answer as
`value`; only the codes differ.

```olx:playground
<Vertical id="likert_mindset">
  <Markdown>*I can get better at writing if I work at it.*</Markdown>
  <ChoiceInput id="likert_growth">
    <Key id="likert_growth_strongly_agree" value="strongly_agree">Strongly agree</Key>
    <Key id="likert_growth_agree" value="agree">Agree</Key>
    <Key id="likert_growth_disagree" value="disagree">Disagree</Key>
    <Key id="likert_growth_strongly_disagree" value="strongly_disagree">Strongly disagree</Key>
  </ChoiceInput>

  <Markdown>*Either you are a writer or you are not.* (reverse-coded)</Markdown>
  <ChoiceInput id="likert_fixed" reverseCoded="true">
    <Key id="likert_fixed_strongly_agree" value="strongly_agree">Strongly agree</Key>
    <Key id="likert_fixed_agree" value="agree">Agree</Key>
    <Key id="likert_fixed_disagree" value="disagree">Disagree</Key>
    <Key id="likert_fixed_strongly_disagree" value="strongly_disagree">Strongly disagree</Key>
  </ChoiceInput>

  <Markdown>Coded: {{@likert_growth.code}} and {{@likert_fixed.code}}</Markdown>
</Vertical>
```

A learner who agrees with both answers `agree` twice, and is recorded as `1`
and `-1` — which is the point. Every option is a `Key` here because nothing is
wrong: `Key`/`Distractor` is a grading distinction, and this instrument is not
graded.

Content that cares about its numbers may write both — `reverseCoded` on the
item for the intent, explicit reversed codes on the options for the record:

```olx:code
<ChoiceInput id="likert_fixed_explicit" reverseCoded="true">
  <Key id="likert_fixed_explicit_strongly_agree" value="strongly_agree" code="-2">Strongly agree</Key>
  <Key id="likert_fixed_explicit_agree" value="agree" code="-1">Agree</Key>
  <Key id="likert_fixed_explicit_disagree" value="disagree" code="1">Disagree</Key>
  <Key id="likert_fixed_explicit_strongly_disagree" value="strongly_disagree" code="2">Strongly disagree</Key>
</ChoiceInput>
```

Each code here is the negated default, so the typo guard stays quiet — and a
sign flip in *either* the attribute or one of the codes would make the two
disagree and warn.

> **Booleans reverse badly.** The negation is plain arithmetic, so under
> `reverseCoded` the boolean family gives `true` → -1 and `false` → 0 (zero
> is its own negation). That is rarely what anyone means, which is why a
> reversed true/false or yes/no item should carry explicit `code=` values
> rather than lean on the table.

## Pedagogical Purpose

Multiple choice assessments offer:

1. **Quick Assessment**: Rapid evaluation of understanding
2. **Diagnostic Value**: Well-designed distractors reveal common misconceptions
3. **Objective Grading**: Clear right/wrong determination
4. **Scaffolding**: Can guide learners toward correct thinking through obvious questions

## Common Use Cases

### Conceptual Understanding

```olx:playground
<CapaProblem id="zpd" title="Zone of Proximal Development">
  <KeyGrader>
    <Markdown>A student can solve basic algebra problems alone but needs teacher help with word problems. According to Vygotsky, word problems are in the student's:</Markdown>
    <ChoiceInput>
      <Distractor>Comfort zone</Distractor>
      <Key>Zone of proximal development</Key>
      <Distractor>Frustration zone</Distractor>
      <Distractor>Mastery zone</Distractor>
    </ChoiceInput>
  </KeyGrader>
</CapaProblem>
```

### Diagnostic Distractors

Well-crafted distractors reveal misconceptions:

```olx:playground
<CapaProblem id="hake" title="Hake's Study">
  <KeyGrader>
    <Markdown>In Hake's 1998 study of 6,000 physics students, what was the approximate normalized gain for interactive engagement vs. traditional lecture?</Markdown>
    <ChoiceInput>
      <Distractor>Both showed gains around 0.25</Distractor>
      <Key>IE: ~0.48, Traditional: ~0.23</Key>
      <Distractor>IE: ~0.23, Traditional: ~0.48</Distractor>
      <Distractor>No significant difference was found</Distractor>
    </ChoiceInput>
  </KeyGrader>
</CapaProblem>
```

### Using value= with UseDynamic

The `value` attribute on Key/Distractor sets the reference value, useful with `UseDynamic` to show content based on selection:

```olx:playground
<Vertical id="adaptive">
  <ChoiceInput id="topic_picker">
    <Key id="choice_behav" value="behaviorist_content">Behaviorism</Key>
    <Distractor id="choice_cog" value="cognitive_content">Cognitivism</Distractor>
  </ChoiceInput>

  <UseDynamic target="behaviorist_content" targetRef="topic_picker" />

  <Hidden>
    <Markdown id="behaviorist_content">**Behaviorism** focuses on observable behaviors and external stimuli, as studied by Skinner and Pavlov.</Markdown>
    <Markdown id="cognitive_content">**Cognitivism** focuses on internal mental processes like memory and problem-solving.</Markdown>
  </Hidden>
</Vertical>
```

## Related Blocks
- **CheckboxInput**: Multi-select; exposes `codes` (an array) instead of `code`
- **Key**: Marks correct answer(s)
- **Distractor**: Marks incorrect answers
- **KeyGrader**: Grades based on Key selection
- **UseDynamic**: Can display content based on selection
