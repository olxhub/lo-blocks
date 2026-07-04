# LiquidTemplate

Renders a [Liquid](https://liquidjs.com/) template with a data file at **parse time**, producing child OLX blocks that are first-class citizens — they have proper IDs, work with MasteryBank, hold state, etc.

## Usage

### External template file

```xml
<LiquidTemplate data="questions.yaml" src="template.liquid" />
```

### Inline template (CDATA)

```xml
<LiquidTemplate data="config.yaml"><![CDATA[
<Markdown id="{{ id }}">## {{ title }}</Markdown>
]]></LiquidTemplate>
```

## Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data`    | Yes      | Path to YAML or JSON data file |
| `src`     | No       | Path to `.liquid` template file (alternative to inline CDATA) |
| `id`      | Yes      | Block ID (standard) |

## Data format

YAML or JSON. The parsed data becomes the Liquid template context directly. No special keys required — the data structure is entirely up to the content author.

## Custom Liquid filters

- `slugify` — `{{ text | slugify }}` — lowercase, spaces/slashes to underscores
- `padStart` — `{{ num | padStart: 3, '0' }}` — zero-pad numbers
- `titleCase` — `{{ text | titleCase }}` — capitalize first letter of each word

## Examples

### Graphic organizer

```yaml
# organizer-config.yaml
question: "What are the three branches of US government?"
hint: "Think about who makes laws, enforces them, and interprets them."
sections: 3
```

```liquid
<!-- graphic-organizer.liquid -->
<Vertical id="organizer" title="{{ question }}">
  <Markdown>{{ question }}</Markdown>
  {% for i in (1..sections) %}
  <TextArea id="section_{{ i }}" placeholder="Branch {{ i }}" />
  {% endfor %}
  <Markdown>*Hint: {{ hint }}*</Markdown>
</Vertical>
```

### Question bank

```yaml
# questions.yaml
options:
  - positive_reinforcement
  - negative_reinforcement
  - positive_punishment
  - negative_punishment
items:
  - title: Candy reward
    stem: "A child receives candy for good behavior."
    key: positive_reinforcement
    explanation: "Adding a pleasant stimulus increases behavior."
```

```liquid
{% for q in items %}
<CapaProblem id="q_{{ forloop.index | padStart: 3, '0' }}_{{ q.key | slugify }}" title="{{ q.title }}">
  <KeyGrader>
    <p>{{ q.stem }}</p>
    <ChoiceInput>
      {% for opt in options %}
        {% if opt == q.key %}
          <Key>{{ opt | titleCase }}</Key>
        {% else %}
          <Distractor>{{ opt | titleCase }}</Distractor>
        {% endif %}
      {% endfor %}
    </ChoiceInput>
    <Explanation showWhen="answered">{{ q.explanation }}</Explanation>
  </KeyGrader>
</CapaProblem>
{% endfor %}
```
