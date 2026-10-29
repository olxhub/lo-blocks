# Explanation

Displays explanation content conditionally based on grader state. Compatible with Open edX CAPA `[explanation]` blocks.

```olx:playground
<CapaProblem id="spacing" title="Spacing Effect">
  <NumericalGrader answer="50">
    <Markdown>In Roediger &amp; Karpicke's 2006 study, students who used retrieval practice remembered approximately what percent more than those who restudied after one week?</Markdown>
    <NumberInput />
    <Explanation><Markdown>
      Students who practiced retrieval retained about **50% more** after one week compared to those who restudied. This demonstrates the testing effect - the act of retrieving information strengthens memory more than passive review.
    </Markdown></Explanation>
  </NumericalGrader>
</CapaProblem>
```

**Important:** Explanation must be nested inside the grader (like inputs). It auto-targets the containing grader.

By default, the explanation appears only after the learner answers correctly, or after they give up with the problem's "Don't know" button (`dontKnow="true"`). Any `showWhen` except `never` also shows it after a give-up. This follows the explanation's own `showWhen`, not the problem's `showanswer`: an exam that must reveal nothing sets `showWhen="never"` here as well.

## showWhen Attribute

Control when the explanation appears:

| Value | Behavior |
|-------|----------|
| `correct` (default) | Show only after correct answer |
| `answered` | Show after any submission |
| `always` | Always visible (useful for debugging) |
| `never` | Never visible (hidden) |

```olx:playground
<CapaProblem id="after_attempt" title="Immediate Feedback">
  <KeyGrader>
    <Markdown>According to research, which is more effective for long-term retention?</Markdown>
    <ChoiceInput>
      <Distractor>Rereading material multiple times</Distractor>
      <Key>Taking practice tests on the material</Key>
      <Distractor>Highlighting key passages</Distractor>
    </ChoiceInput>
    <Explanation showWhen="answered"><Markdown>
      **Practice testing** is one of the most effective study strategies. Dunlosky et al. (2013) rated it as having "high utility" based on extensive research showing it produces durable, transferable learning.
    </Markdown></Explanation>
  </KeyGrader>
</CapaProblem>
```

## Multiple Graders

In problems with multiple graders, nest each Explanation inside its grader:

```olx:playground
<CapaProblem id="multi" title="Study Strategies">
  <NumericalGrader id="part_a" answer="48">
    <Markdown>**Part A:** In Hake's 1998 physics study, what was the average normalized gain for interactive engagement classes? (Enter as percentage)</Markdown>
    <NumberInput />
    <Explanation><Markdown>Interactive engagement classes achieved ~48% normalized gain, roughly double the ~23% for traditional lecture.</Markdown></Explanation>
  </NumericalGrader>

  <NumericalGrader id="part_b" answer="23">
    <Markdown>**Part B:** What was the average normalized gain for traditional lecture classes?</Markdown>
    <NumberInput />
    <Explanation><Markdown>Traditional lecture classes averaged ~23% normalized gain - demonstrating that passive instruction is significantly less effective.</Markdown></Explanation>
  </NumericalGrader>
</CapaProblem>
```

## Shared Explanations

When several problems share background, write it once and pull it in with `<Use>`. The shared block can live anywhere in the namespace, including another file; a problem's Explanation can mix a problem-specific note, one or more shared blocks and a citation.

```olx:playground
<Vertical id="shared_demo">
  <Markdown id="spacing_background">
**Spacing effect.** Cepeda et al. (2008) found the best gap between study sessions shrinks as a share of the time until the test: about 20–40% of a week, 5–10% of a year. For a test in two months, a gap of one to two weeks.
  </Markdown>

  <CapaProblem id="spacing_q1" dontKnow="true">
    <NumericalGrader answer="10" tolerance="4">
      <Markdown>You have a test in two months. Roughly how many days should separate your study sessions?</Markdown>
      <NumberInput />
      <Explanation>
        <Markdown>Two months is about 60 days; between the one-week and one-year figures, 10–20% of that is 6 to 12 days.</Markdown>
        <Use ref="spacing_background" />
      </Explanation>
    </NumericalGrader>
  </CapaProblem>
</Vertical>
```

Repeated exposure to the same short summary across many problems is the point: each retrieval attempt ends with the same compact reference, so keep shared blocks to a table or a few bullets.

## Styling

The component uses these CSS classes:
- `lo-explanation` - Outer container
- `lo-explanation__header` - Title/heading
- `lo-explanation__content` - Content area

Default styling shows a blue-highlighted box with left border.

