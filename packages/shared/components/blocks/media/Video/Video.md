# Video

A video with its transcript beside it, sharing one media bucket — the composed
experience, as against the two parts.

Reach for this first. `<VideoPlayer>` and `<Transcript>` exist for the cases where
the two need to sit apart on the page, and wiring them together yourself means
taking on the bucket they share.

Attributes are generated from the schema and shown on this block's Overview tab.

## One bucket, one writer

The player is the ONLY writer of `currentTime`; the transcript follows it and
writes back only when a line is clicked. That single-writer rule is what keeps the
two from fighting over the position, and it is why they must share a bucket rather
than each keep their own.

## Related blocks

- **VideoPlayer** — just the video element
- **Transcript** — just the scrolling transcript
