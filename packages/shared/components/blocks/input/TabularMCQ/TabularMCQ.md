# TabularMCQ

Matrix-style multiple choice for surveys, assessments, personality tests, and Likert-scale items.

```olx:playground
<Vertical id="course_feedback">
  <Markdown>How useful was each component of this course?</Markdown>
  <TabularMCQ id="feedback">
cols: Not useful, Slightly useful, Useful, Very useful
rows: Readings, Lectures, Discussion sections, Problem sets
  </TabularMCQ>
</Vertical>
```

## Content Format

Content is YAML. The compact form uses commas to separate items:

```olx:code
<TabularMCQ id="survey">
cols: Strongly Disagree, Disagree, Neutral, Agree, Strongly Agree
rows: I learn well from lectures, I learn well from discussion, I learn well from projects
</TabularMCQ>
```

When items contain commas, use a YAML list:

```olx:code
<TabularMCQ id="precise_survey">
cols: Strongly Disagree, Disagree, Neutral, Agree, Strongly Agree
rows:
  - I learn well from lectures
  - "In small groups, I learn more than alone"
  - I enjoy problem sets
</TabularMCQ>
```

Both forms can be mixed freely. Compact and YAML-list are interchangeable.

## With Column Values (for scoring)

Column values enable numeric scoring for Likert scales and personality tests.
Use `|value` after a column label:

```olx:playground
<Vertical id="banking_ed">
  <Markdown>
Rate how accurately each statement describes your educational experience
(adapted from Freire, *Pedagogy of the Oppressed*, 1970):
  </Markdown>
  <TabularMCQ id="freire_likert">
cols: Strongly Disagree|-2, Disagree|-1, Neutral|0, Agree|1, Strongly Agree|2
rows:
  - The teacher teaches and the students are taught|taught
  - The teacher knows everything and the students know nothing|knows
  - The teacher thinks and the students are thought about|thinks
  - The teacher talks and the students listen — meekly|talks
  - The teacher disciplines and the students are disciplined|disciplines
  - "The teacher chooses and enforces his choice, and the students comply|chooses"
  - The teacher acts and the students have the illusion of acting through the action of the teacher|acts
  - "The teacher chooses the program content, and the students (who were not consulted) adapt to it|content"
  - "The teacher confuses the authority of knowledge with his or her own professional authority, which she and he sets in opposition to the freedom of the students|authority"
  - "The teacher is the Subject of the learning process, while the pupils are mere objects|subject"
  </TabularMCQ>
</Vertical>
```

## Graded Mode (with correct answers)

Mark expected answers using `[ColumnLabel]` after a row. Wrap in
CapaProblem + TabularMCQGrader for a graded problem:

```olx:playground
<CapaProblem id="freire_quiz" title="Banking vs. Problem-Posing Education">
  <Markdown>
Classify each practice as *banking* or *problem-posing* education
(Freire, *Pedagogy of the Oppressed*, 1970):
  </Markdown>
  <TabularMCQGrader>
    <TabularMCQ id="freire_classify">
cols: Banking, Problem-Posing
rows:
  - Mythicizes reality to conceal certain facts|mythicize[Banking]
  - Sets itself the task of demythologizing|demythologize[Problem-Posing]
  - Resists dialogue|resists_dialogue[Banking]
  - Regards dialogue as indispensable to the act of cognition|dialogue[Problem-Posing]
  - Treats students as objects of assistance|objects[Banking]
  - Makes students critical thinkers|critical[Problem-Posing]
  - Inhibits creativity and domesticates consciousness|inhibit[Banking]
  - Stimulates true reflection and action upon reality|reflection[Problem-Posing]
  - "Denies people their ontological and historical vocation of becoming more fully human|denies[Banking]"
  - "Responds to the vocation of persons as beings who are authentic only when engaged in inquiry and creative transformation|responds[Problem-Posing]"
  - Fails to acknowledge men and women as historical beings|fails[Banking]
  - Takes people's historicity as its starting point|historicity[Problem-Posing]
    </TabularMCQ>
  </TabularMCQGrader>
</CapaProblem>
```

## Checkbox Mode (multiple selections per row)

```olx:playground
<Vertical id="method_survey">
  <Markdown>Which teaching methods have you experienced in each setting?</Markdown>
  <TabularMCQ id="methods">
mode: checkbox
cols: Lecture, Seminar, Lab, Online
rows: Undergraduate, Graduate, Professional development
  </TabularMCQ>
</Vertical>
```

## Explicit YAML Object Form

For full control, use YAML objects instead of string shorthand:

```olx:code
<TabularMCQ id="explicit_example">
cols:
  - text: Strongly Disagree
    value: -2
  - text: Disagree
    value: -1
  - text: Neutral
    value: 0
  - text: Agree
    value: 1
  - text: Strongly Agree
    value: 2
rows:
  - text: "On a scale from 1 to 5, how much do you like escape characters?"
    id: escape_chars
  - text: I prefer structured formats
    id: structured
</TabularMCQ>
```

## Syntax Reference

Content is YAML with three fields:

```yaml
mode: checkbox             # Optional: 'radio' (default) or 'checkbox'
cols: Col1, Col2|value     # Comma-separated or YAML list
rows: Row1|id[answer]      # Comma-separated or YAML list
```

**Column shorthand**: `Label|number` attaches a numeric value for scoring.

**Row shorthand**: `Label|id` sets a stable ID; `Label[answer]` marks the correct column for grading. Both can combine: `Label|id[answer]`.

**Commas in text**: Use a YAML list instead of comma-separation, or quote the item: `"yes, really"`.

## State Format

- **Radio mode**: `{ rowId: colIndex }` — one selection per row
- **Checkbox mode**: `{ rowId: [colIndex, ...] }` — multiple selections per row

## Related Blocks

- **TabularMCQGrader** — Auto-grades based on `[answer]` annotations
- **CapaProblem** — Problem container with submit button
