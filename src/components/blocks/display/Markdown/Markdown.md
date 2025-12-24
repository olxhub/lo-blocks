# Markdown

Renders text using GitHub-Flavored Markdown (GFM). Provides rich text display including headers, lists, links, code blocks, and tables.

```olx:playground
<Markdown>
## The Testing Effect

Research consistently shows that **retrieval practice** is more effective than passive review:

- Roediger &amp; Karpicke (2006): 50% better retention after one week
- The act of *retrieving* information strengthens memory traces
- Even unsuccessful retrieval attempts improve subsequent learning

> "Testing is a learning event, not just an assessment."
</Markdown>
```

## Properties
- `src` (optional): Path to an external markdown file

## External Files

```olx:code
<Markdown src="content/spaced_practice.md" />
```

## Supported Features

- Headers (`#`, `##`, `###`)
- Bold (`**text**`) and italic (`*text*`)
- Links (`[text](url)`)
- Images (`![alt](src)`)
- Code blocks (fenced with triple backticks)
- Inline code (single backticks)
- Ordered and unordered lists
- Tables (GFM)
- Blockquotes (`>`)
- Task lists (`- [ ]` and `- [x]`)

## Common Use Cases

### Instructional Content

```olx:playground
<Markdown>
### Worked Example: Calculating Effect Size

**Given:** Treatment mean = 75, Control mean = 70, SD = 10

**Step 1:** Cohen's d = (M₁ - M₂) / SD

**Step 2:** d = (75 - 70) / 10 = 0.5

**Interpretation:** This is a "medium" effect size.
</Markdown>
```

### Tables for Data Presentation

```olx:playground
<Markdown>
| Strategy | Effect Size | Source |
|----------|-------------|--------|
| Practice testing | 0.70 | Dunlosky et al. (2013) |
| Distributed practice | 0.60 | Cepeda et al. (2006) |
| Interleaved practice | 0.60 | Rohrer &amp; Taylor (2007) |
| Self-explanation | 0.55 | Chi et al. (1989) |
</Markdown>
```

### Combined with Interactive Elements

Use CDATA when embedding OLX inside Markdown to avoid XML parsing conflicts:

~~~olx:playground
<Markdown id="combo"><![CDATA[
### Pre-Test

Before reading about the spacing effect, predict the answer:

```olx:render
<CapaProblem id="pretest">
  <KeyGrader>
    Which study schedule produces the best long-term retention?
    <ChoiceInput>
      <Distractor>Massed practice (cramming)</Distractor>
      <Key>Distributed practice (spaced over time)</Key>
      <Distractor>No difference - total time is what matters</Distractor>
    </ChoiceInput>
  </KeyGrader>
</CapaProblem>
```
]]></Markdown>
~~~

## OLX Embedding (Prototype)

Markdown supports embedding live OLX components using special fenced code blocks:

- ` ```olx:render ` - Renders live component
- ` ```olx:code ` - Shows code only
- ` ```olx:playground ` - Side-by-side editor + preview

Use `src=` attribute or CDATA to avoid XML parsing issues when Markdown contains OLX tags.

See `/content/demos/olx-in-markdown-demo.olx` for a working example.
