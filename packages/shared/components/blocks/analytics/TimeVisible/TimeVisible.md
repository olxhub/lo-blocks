# TimeVisible

An invisible stopwatch. Drop it next to an activity and it records how long
the learner actually spent there.

```olx:playground
<Vertical id="tv_demo">
  <TextArea id="tv_demo_draft" rows="3" placeholder="Type something..." />
  <TimeVisible id="tv_demo_timer" idleTimeout="10 seconds" debug="true" />
</Vertical>
```

## What counts as time

A second is added only when **all** of these are true:

1. The block is mounted.
2. The browser tab is foregrounded (`document.visibilityState === 'visible'`).
3. The block's own DOM node is laid out — it is not inside a hidden
   container. This measures the active panel, not whether the timer's tiny
   marker intersects the viewport. Place one timer anywhere inside the
   activity being measured.
4. There was a keyboard, pointer, scroll, or touch event within the last
   `idleTimeout` (default 60 seconds).

## Attributes

| Attribute     | Type     | Default | Description |
|---------------|----------|---------|-------------|
| `idleTimeout` | duration | `60`    | Pause after this long with no learner activity. Accepts `"90 seconds"`, `"2 minutes"`, or a bare number of seconds. |
| `debug`       | boolean  | `false` | Render the running total instead of nothing, humanized (`1 minute 5 seconds`). |

## State

The running total, in seconds, is the standard `value` field. Any block can
read it:

The raw number is rarely what you want to put in front of a student. The
state language's `formatDuration()` turns it into words, using the same
vocabulary as this block's own `debug` readout:

```xml
<Markdown>You spent {{formatDuration(@time_drafting.value)}} drafting.</Markdown>
```

```xml
<Markdown>You spent {{@time_drafting.value}} seconds drafting.</Markdown>
<ObservablePlot template="state">
marks:
  - type: barY
    data: [{phase: "Drafting", seconds: {{@time_drafting.value}}}]
    x: phase
    y: seconds
</ObservablePlot>
```

Because `value` is persisted like any other field, the count **survives a
refresh** — on remount the block keeps adding to the stored total rather
than starting over.

Writes are batched: the internal tick is one second, but Redux is only
written every five seconds (and immediately on unmount or when the tab is
hidden), so a long session produces a manageable number of events.

## Measuring phases of a writing process

The intended use is one timer per phase, so a report can show where the
time went:

```xml
<Tabs id="wpj3_tabs">
  <Vertical id="wpj3_brainstorming" title="Brainstorming">
    <TextArea id="wpj3_brainstorm_text" rows="10" />
    <TimeVisible id="wpj3_time_brainstorming" />
  </Vertical>
  <Vertical id="wpj3_drafting" title="Drafting">
    <TextArea id="wpj3_draft_text" rows="20" />
    <TimeVisible id="wpj3_time_drafting" />
  </Vertical>
</Tabs>
```

## Caveats

- Idleness is inferred from input events on `document`, so a learner
  reading a long passage without touching anything is counted as idle after
  `idleTimeout`. Set a longer timeout for reading-heavy activities.
- The clock is wall-clock seconds accumulated by a one-second interval.
  Browsers throttle timers in background tabs, but rule 2 already excludes
  that time, so the throttling is harmless.
