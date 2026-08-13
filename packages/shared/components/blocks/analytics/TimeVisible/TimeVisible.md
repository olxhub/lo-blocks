# TimeVisible

> **Internal stopgap:** This is a one-off client-side timer added so the current
> writing content can collect approximate attended-time data before proper
> server-side analytics land. It is not a general-purpose analytics API and
> new content should not depend on it without revisiting that architecture.

Wrap one activity block and it approximates how long the learner actively had
that part of the page open.

The eventual analytics design still needs to decide whether to keep this
explicit wrapper, add or replace it with a marker/tracking-pixel mode, record
visits as well as duration, and interpret visibility as layout presence or
actual viewport intersection.

```olx:playground
<Vertical id="tv_demo">
  <TimeVisible id="tv_demo_timer" idleTimeout="10 seconds" debug="true">
    <TextArea id="tv_demo_draft" rows="3" placeholder="Type something..." />
  </TimeVisible>
</Vertical>
```

## What counts as time

A second is added only when **all** of these are true:

1. The block is mounted.
2. The browser tab is foregrounded (`document.visibilityState === 'visible'`).
3. The wrapper around the child is laid out — it is not inside a hidden
   container. This measures the active panel, not whether the child intersects
   the viewport.
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

## Current writing-content use

The immediate use is one timer per writing phase, so a report can show where
the time went:

```xml
<Tabs id="wpj3_tabs">
  <Vertical id="wpj3_brainstorming" title="Brainstorming">
    <TimeVisible id="wpj3_time_brainstorming">
      <TextArea id="wpj3_brainstorm_text" rows="10" />
    </TimeVisible>
  </Vertical>
  <Vertical id="wpj3_drafting" title="Drafting">
    <TimeVisible id="wpj3_time_drafting">
      <TextArea id="wpj3_draft_text" rows="20" />
    </TimeVisible>
  </Vertical>
</Tabs>
```

## Caveats

- Timing and persistence happen entirely in the browser. The resulting value
  is learner-controlled state, not authoritative analytics data.
- Idleness is inferred from input events on `document`, so a learner
  reading a long passage without touching anything is counted as idle after
  `idleTimeout`. Set a longer timeout for reading-heavy activities.
- The clock is wall-clock seconds accumulated by a one-second interval.
  Browsers throttle timers in background tabs, but rule 2 already excludes
  that time, so the throttling is harmless.
