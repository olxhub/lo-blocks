# Conjunction

Checks that gate TOGETHER under one code. Renders nothing.

## Why not several gating slots

Gating slots each stand alone: the first unsatisfied one charges and the rest are
moot. A conjunction is one finding about several readings, and with
`list="true"` it names every member that failed — "Missing: names a behavior,
names what is added" rather than a charge that mentions only the first.

A slot must not be BOTH a gate and a conjunction member. Both read the same
answer, so the item would charge the same failure twice, and the two disagree
about what the feedback says.

```olx:playground
<Vertical id="conjunction_demo">
  <Rubric id="conjunction_rubric">
    <Item scores="demo_q" max="4">
      <Slot key="names_a_thing" label="Names the thing" verdicts="met|absent">a thing is named</Slot>
      <Slot key="says_when" label="Says when" verdicts="met|absent">the timing is given</Slot>
      <Deduction code="INCOMPLETE" pts="4">This does not describe an arrangement.</Deduction>
      <Conjunction code="INCOMPLETE" note="Missing: " list="true" over="names_a_thing,says_when"/>
    </Item>
  </Rubric>
  <Markdown id="conjunction_note">A rubric renders nothing; this note gives the
  playground something to show.</Markdown>
</Vertical>
```

## Related blocks

- **Slot** — `gate="true"` for a check that stands alone
- **Forbid** — a COMBINATION refused, rather than a set that must all hold
