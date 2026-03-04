# Collapsible

Expandable/collapsible sections for progressive disclosure. Content is hidden until clicked, useful for optional information or organizing dense material.

```olx:playground
<Collapsible id="research" title="Research Background">
  <Markdown>
Hake (1998) analyzed 62 introductory physics courses and found that interactive engagement methods produced normalized learning gains of ~0.48, compared to ~0.23 for traditional lecture - roughly doubling student learning.
  </Markdown>
</Collapsible>
```

## Properties
- `title` or `label`: Header text shown in the collapsed state

## State
- `expanded`: Boolean tracking open/closed state, persisted across sessions

## Common Use Cases

### Hints and Help

Provide optional scaffolding without cluttering the main content:

```olx:playground
<Vertical id="hint_demo">
  <Markdown>What instructional approach did Bloom identify as producing two standard deviations improvement over conventional instruction?</Markdown>
  <Collapsible id="hint" title="Need a hint?">
    <Markdown>Think about the ratio of students to tutors. Bloom's famous "2 sigma problem" asked how group instruction could achieve the same results as...</Markdown>
  </Collapsible>
</Vertical>
```

### Supplementary Resources

Hide readings and references that some learners may want:

```olx:playground
<Collapsible id="readings" title="Further Reading">
  <Markdown>
- Freeman, S. et al. (2014). Active learning increases student performance in science, engineering, and mathematics. *PNAS*, 111(23), 8410-8415.
- Chi, M. T. H., & Wylie, R. (2014). The ICAP framework: Linking cognitive engagement to active learning outcomes. *Educational Psychologist*, 49(4), 219-243.
  </Markdown>
</Collapsible>
```

### Worked Examples

Let learners attempt problems before revealing solutions:

```olx:playground
<Vertical id="worked">
  <Markdown>Calculate Cohen's d if the treatment group mean is 75, control mean is 70, and pooled standard deviation is 10.</Markdown>
  <Collapsible id="solution" title="Show Solution">
    <Markdown>
**Cohen's d** = (M₁ - M₂) / SD_pooled

d = (75 - 70) / 10 = 5 / 10 = **0.5**

This represents a "medium" effect size according to Cohen's conventions (small = 0.2, medium = 0.5, large = 0.8).
    </Markdown>
  </Collapsible>
</Vertical>
```

### Nested Organization

Collapsible sections can nest for hierarchical content:

```olx:playground
<Collapsible id="theories" title="Learning Theories">
  <Collapsible id="behaviorism" title="Behaviorism">
    <Markdown>Focuses on observable behaviors. Key figures: Skinner, Pavlov, Thorndike.</Markdown>
  </Collapsible>
  <Collapsible id="cognitivism" title="Cognitivism">
    <Markdown>Focuses on mental processes. Key figures: Piaget, Bruner, Ausubel.</Markdown>
  </Collapsible>
  <Collapsible id="constructivism" title="Constructivism">
    <Markdown>Focuses on knowledge construction. Key figures: Vygotsky, Dewey.</Markdown>
  </Collapsible>
</Collapsible>
```
