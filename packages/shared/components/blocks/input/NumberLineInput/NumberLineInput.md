# NumberLineInput

Pick one position on a horizontal number line. The stored value is always a
number, so the block works with any grader that takes a number — but what the
learner sees at each position is content: words, emoji, images, Markdown.

A Likert item is a number line with one labeled tick per step and
`snap="ticks"`. A continuum ("how big is a frog?") is the same block with
labels only at the ends and `snap="step"`.

```olx:playground
<Vertical id="frog_demo">
  <Markdown>Drag the marker to where a frog belongs:</Markdown>
  <NumberLineInput id="frog_size" min="0" max="100" step="1" snap="step" showValue="true">
    <Tick value="0"   label="elephant" > 🐘 elephant </Tick>
    <Tick value="100" label="virus"    > 🦠 virus    </Tick>
  </NumberLineInput>
</Vertical>
```

## Properties

| Attribute | Type | Default | Purpose |
|---|---|---|---|
| `min` | number | `0` | Lowest position on the line |
| `max` | number | `100` | Highest position on the line |
| `step` | number | `1` | Granularity of positions. Must be greater than 0 — a continuum is a small step, e.g. `step="0.01"` |
| `snap` | `step` \| `ticks` | `ticks` when the line has `<Tick>` children, else `step` | What the committed value snaps to. With `ticks`, the value is the nearest tick's value, however unevenly the ticks are spaced |
| `initial` | expression | midpoint of `min`/`max` | Where the thumb rests while the line is unanswered, e.g. `initial="50"` or `initial="@pretest.value"`. **Not** the value: the value stays unset until the learner acts |
| `reference` | expression | — | A fixed, non-draggable marker on the same line ("where you are now" while the learner drags "a year from now") |
| `referenceLabel` | plain text | — | Small label under the reference marker |
| `readonly` | boolean | `false` | Show the line without allowing changes. Also a field, so `SetFieldAction` can lock it at runtime |
| `showValue` | boolean | `false` | Print the current position (or its tick's label) beside the line |

`id`, `class`, `title`, `when` and `lang` come from the base attributes.

An author setting only endpoint labels usually wants `snap="step"` as well:
ticks switch snapping on by default, and a line with two ticks and no `snap=`
lets the learner choose only the two ends.

## Tick

A `<Tick>` is one labeled position. Its children are Markdown — a word, an
emoji, an image — and they are what the learner reads; the number lives in
`value=` and is what gets stored. Endpoint labels are simply Ticks at `min`
and at `max`.

| Attribute | Type | Purpose |
|---|---|---|
| `value` | number, **required** | Position on the line. Must lie between the line's `min` and `max`; two ticks may not share a position |
| `label` | plain text | What a screen reader says at this position. Defaults to the tick's own text with Markdown markers stripped — set it when the tick is an image or an emoji |

Both rules are checked when the content is parsed, so a mislabeled scale
fails loudly instead of quietly mapping answers to the wrong numbers.

## State

- `value`: the chosen position, as a number. Unset until the learner acts.
- `readonly`: whether the line is currently locked (defaults to the OLX attribute).

## getValue

Returns the number the learner selected, or nothing if they have not
answered.

## Examples

### A Likert scale

```olx:playground
<NumberLineInput id="likert_spacing" min="1" max="5" step="1" snap="ticks"
                 title="Spacing my practice helps me remember more">
  <Tick value="1"> Strongly disagree </Tick>
  <Tick value="2"> Disagree          </Tick>
  <Tick value="3"> Neutral           </Tick>
  <Tick value="4"> Agree             </Tick>
  <Tick value="5"> Strongly agree    </Tick>
</NumberLineInput>
```

Emoji work the same way; give them a `label=` so the scale can be read aloud:

```olx:playground
<NumberLineInput id="likert_faces" min="1" max="3" step="1" snap="ticks"
                 title="Did you like this exercise?">
  <Tick value="1" label="no"    > 🙁 </Tick>
  <Tick value="2" label="mixed" > 😐 </Tick>
  <Tick value="3" label="yes"   > 🙂 </Tick>
</NumberLineInput>
```

### Now, and a year from now

`reference=` puts a fixed marker on the line, so "drag to where you'd like to
be" can be read against where the learner is today. Both attributes are
expressions, so they can follow another block's value:

```olx:playground
<Vertical id="reference_demo">
  <Markdown>**Where are you now** with spaced practice?</Markdown>
  <NumberLineInput id="reference_now" min="0" max="10" step="1" snap="step" showValue="true">
    <Tick value="0"  label="never"  > never         </Tick>
    <Tick value="10" label="always" > every session </Tick>
  </NumberLineInput>

  <Markdown>**And a year from now?** The thin marker shows where you are today.</Markdown>
  <NumberLineInput id="reference_goal" min="0" max="10" step="1" snap="step" showValue="true"
                   initial="@reference_now.value" reference="@reference_now.value" referenceLabel="now">
    <Tick value="0"  label="never"  > never         </Tick>
    <Tick value="10" label="always" > every session </Tick>
  </NumberLineInput>
</Vertical>
```

The same block with `readonly="true"` and an `initial=` expression is a
read-only display of an answer given elsewhere — the results screen and the
input screen then show the identical scale.

### Graded

The value is a number, so any numeric grader accepts it:

```olx:playground
<CapaProblem id="water_problem" title="Water on Earth" lockInput="attempted">
  <NumericalGrader id="water_grader" answer="71" tolerance="3">
    <Markdown>About what percent of Earth's surface is covered by water?</Markdown>
    <NumberLineInput id="water_estimate" min="0" max="100" step="1" snap="step" initial="0" showValue="true">
      <Tick value="0"   label="none"       > 0%   </Tick>
      <Tick value="50"  label="half"       > 50%  </Tick>
      <Tick value="100" label="everything" > 100% </Tick>
    </NumberLineInput>
  </NumericalGrader>
</CapaProblem>
```

`lockInput=` on the problem locks the line once it has been submitted, the
same way it locks any other input.

## Accessibility

The block wraps a native `<input type="range">`, so it arrives with
`role="slider"`, `aria-valuemin`/`max`/`now`, arrow and Home/End keys, touch
dragging, and a track that mirrors itself under `dir="rtl"`.

On top of that:

- `aria-valuetext` is the nearest tick's label when the line snaps to ticks,
  so a screen reader says "Strongly agree", not "5". Without ticks it is the
  number, formatted for the block's `lang`.
- The line is named by its `title=`; with no title it is named by its end
  ticks ("Strongly disagree – Strongly agree"). Nothing in the component is
  English — every word a learner hears comes from the content, so a
  translated course reads correctly.
- The tick layer is positioned with logical properties, and the focus ring is
  drawn with the theme's focus tokens so it survives custom track styling.
- An unanswered line shows a hollow thumb on a fully visible track: the thumb
  has to rest somewhere, and it must not look like an answer the learner gave,
  but the scale itself is still there to be read.
- The labels on the end ticks anchor inward from their mark rather than
  straddling it, so the first and last words of a scale are never clipped by
  the edge of the line or of the panel around it.
- Touching or focusing-and-keying the line at its resting position counts as
  choosing it, so a learner who means the midpoint of a Likert can click the
  thumb where it already sits (or press Home at `min`) and still answer.

## Related

- `NumberInput` — typed numeric entry, for exact values
- `ChoiceInput` — one of several options, when the options are not ordered
- `NumericalGrader` — grades the number, with tolerance
