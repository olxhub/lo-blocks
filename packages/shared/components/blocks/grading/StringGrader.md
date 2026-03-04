# StringGrader

Grades text answers with exact match, case-insensitive, or regular expression support.

```olx:playground
<CapaProblem id="terminology" title="Assessment Terminology">
  What is the term for a wrong answer option in a multiple choice question?
  <StringGrader answer="distractor" ignoreCase="true">
    <LineInput />
  </StringGrader>
</CapaProblem>
```

## Properties

- `answer` (required): Expected answer (string or regexp pattern)
- `ignoreCase` (optional): Case-insensitive matching
- `regexp` (optional): Treat answer as a regular expression
- `displayAnswer` (optional): Text shown for Show Answer (use with regexp)

## Case-Insensitive

```olx:playground
<CapaProblem id="planets" title="Largest Planet">
  What is the largest planet in our solar system?
  <StringGrader answer="Jupiter" ignoreCase="true">
    <LineInput />
  </StringGrader>
</CapaProblem>
```

## Regular Expressions

For flexible matching patterns. Always provide `displayAnswer` since the regexp itself isn't helpful to students:

```olx:playground
<CapaProblem id="spelling" title="Spelling Variants">
  Enter the word for describing something with hue (American or British spelling):
  <StringGrader answer="colou?r" regexp="true" ignoreCase="true" displayAnswer="color or colour">
    <LineInput />
  </StringGrader>
</CapaProblem>
```

## How It Works

1. Trims whitespace from student input
2. If `regexp="true"`, compiles answer as regex with `^...$` anchors
3. If `ignoreCase="true"`, comparison is case-insensitive
4. Returns CORRECT or INCORRECT

## Related Blocks

- **LineInput**: Single-line text input
- **RulesGrader**: Multiple patterns with different feedback
- **DefaultGrader**: Accept any non-empty answer
