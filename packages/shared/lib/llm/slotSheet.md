# Slot sheets

Turns an authored checklist into a strict JSON Schema, and a filled-in checklist
back into readable feedback.

## Why a schema rather than an instruction

A prompt can ask a model to work through a list of checks, but nothing makes it
finish one — it can answer three of eight and write fluent prose about the three.
Declaring each check as a REQUIRED property of a strict schema makes the omission
impossible rather than discouraged: an incomplete answer is not returned at all.

That is the whole argument for the sheet. It is not a formatting convenience.

## The scoring is arithmetic over the answers

Once the checks come back, the score follows from them and the points each check
carries. Nothing is re-judged at that stage, which is what makes the same answers
score identically on either engine.

## Related

- [`promptAssembler`](./promptAssembler.md) — the prose that asks for the sheet
- [`attributeAssembler`](./attributeAssembler.md) — where the sheet's attributes come from
- [`derivedVerdicts`](./derivedVerdicts.md) — checks answered without a model
