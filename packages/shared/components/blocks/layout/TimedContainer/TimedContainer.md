# TimedContainer

Enforces a time limit. When time runs out, the content becomes non-interactive and stays visible so students can see what they wrote.

```olx:playground
<TimedContainer id="timed_write" duration="30 seconds" start="go">
  <Markdown>Jot down everything you know about photosynthesis.</Markdown>
  <TextArea id="quick_write" rows="5" placeholder="Start writing when the timer begins..." />
</TimedContainer>
```

## Attributes

| Attribute  | Type   | Default    | Description |
|------------|--------|------------|-------------|
| `duration` | string | (required) | Time limit: `"5 minutes"`, `"1 hour 30 minutes"`, `"90"` (seconds) |
| `start`    | `"go"` \| `"render"` | `"go"` | `"go"`: student clicks Start. `"render"`: starts immediately. |
| `label`    | string | `"Start"`  | Text on the start button |
| `before`   | string | —          | Text shown on the start screen (above the duration and button) |
| `after`    | string | —          | Text shown after time runs out |

## Timer Display

The timer shows approximate time remaining and only updates when crossing a threshold — no distracting second-by-second ticking. In the final 15 seconds, it counts down precisely.

Color gradually shifts from black to red near the end.

## Before and After

Use `when=` on children to show different content before, during, and after the timer:

- `when="!@timer.started"` — visible before the student clicks Start
- `when="@timer.started"` — visible once the timer is running (stays visible after expiry)
- `when="@timer.expired"` — visible only after time runs out

```olx:playground
<TimedContainer id="exam" duration="2 minutes" start="go">
  <Markdown when="!@exam.started">
**Instructions**

You'll have 2 minutes to answer. Read the question, then click Start.
  </Markdown>
  <Vertical when="@exam.started">
    <Markdown>What are three differences between formative and summative assessment?</Markdown>
    <TextArea id="answer" rows="4" />
  </Vertical>
  <Markdown when="@exam.expired">Your response has been saved.</Markdown>
</TimedContainer>
```

Without any `when=` attributes, all children are always visible — shown as a preview before start, interactive during the timer, and frozen when time runs out.

## Timer Persistence

The timer uses wall-clock time. If a student refreshes or navigates away and returns, the elapsed time is preserved.

## Examples

### Quick-write (auto-start)

```xml
<TimedContainer id="freewrite" duration="3 minutes" start="render">
  <TextArea id="freewrite_input" rows="8" placeholder="Write freely..." />
</TimedContainer>
```

### Timed exam with hidden questions

```xml
<TimedContainer id="midterm" duration="30 minutes">
  <Markdown when="!@midterm.started">You have 30 minutes. Click Start when you're ready.</Markdown>
  <Vertical when="@midterm.started">
    <NumberInput id="q1" placeholder="Question 1" />
    <NumberInput id="q2" placeholder="Question 2" />
  </Vertical>
</TimedContainer>
```

### Speed round

```xml
<TimedContainer id="speed" duration="60 seconds" label="Go!">
  <NumberInput id="answer" placeholder="Solve: 17 x 23" />
</TimedContainer>
```

## Related
- **OnShow** — run actions when a section is viewed
- **Sequential** — step-by-step navigation
