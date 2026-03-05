# Mermaid

Renders [Mermaid](https://mermaid.js.org/) diagrams — flowcharts, sequence diagrams, Gantt charts, class diagrams, and more.

```olx:playground
<Mermaid>
graph TD
    A[Student reads material] --> B{Understands?}
    B -->|Yes| C[Practice problems]
    B -->|No| D[Review with hints]
    D --> A
    C --> E[Assessment]
</Mermaid>
```

## Properties

- `src` (optional): Path to an external `.mmd` or `.mermaid` file

## External Files

```olx:code
<Mermaid src="diagrams/learning_flow.mmd" />
```

## Sequence Diagram

```olx:playground
<Mermaid>
sequenceDiagram
    Student->>+LMS: Submit answer
    LMS->>+Grader: Grade submission
    Grader-->>-LMS: Result
    LMS-->>-Student: Feedback
</Mermaid>
```

## Supported Diagram Types

See the [Mermaid documentation](https://mermaid.js.org/intro/) for the full list, including:

- Flowcharts (`graph TD`, `graph LR`)
- Sequence diagrams
- Class diagrams
- State diagrams
- Gantt charts
- Pie charts
- Entity relationship diagrams
