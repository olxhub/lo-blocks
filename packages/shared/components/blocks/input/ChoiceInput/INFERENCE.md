# What `<Key> True </Key>` should mean — a breadcrumb

OLX is meant to make easy things easy and hard things possible. The easiest
true/false question a person can write is:

```xml
<ChoiceInput id="q1">
  <Key> True </Key>
  <Distractor> False </Distractor>
</ChoiceInput>
```

A human reads that and knows everything: two options, the first is correct,
their values are `true` and `false`, and their codes are 1 and 0. The platform
does not know most of it yet. This file scopes the chain that would close the
gap, says which links exist today, and is the place to argue with the design
before building the rest.

Same breadcrumb rules as the value-state predicate table
(`lib/stateLanguage/valuePredicates.ts`): this may be **changed** if it stops
making sense, and must not be **deleted** unless it is replaced by something
serving the same use cases. The point is the use cases, not the mapping.

## The chain

### (a) value from the option's text — DOES NOT EXIST

An option with no `value=` has no value of its own. `getChoices`
(`choiceHelpers.ts`) falls back to the option's **definition key**, so the
value a selection stores is an opaque machine identifier rather than a word:

- Hand-authored option with no `id=`: the key is a content hash,
  `CONTENT/_3b1464d9…` (`createDefinitionRef` in `lib/content/parseOLX.ts`
  hashes the node).
- `MarkupProblem`-generated option: the key is positional —
  `…_choice_0_2` (`joinDefinitionRef(parentRef, CHOICE, inputIndex, i)`), which
  renumbers when options are reordered.

What is missing: slugify the option's rendered text (`Strongly agree` →
`strongly_agree`) and use it as the value when `value=` is absent. The open
questions are real ones — the text may be Markdown, math, or an image; it may
be translated, which would make a Polish item's stored value Polish; and two
options may slugify the same. None of that is hard, but none of it is decided,
so nothing was built here. **Not extended in this commit.**

### (b) id from input id + value — DOES NOT EXIST

Tracked in `notes/bugs.md` (workspace notes, read-only from here), under
*"Key/Distractor identity: split ID from VALUE"*: today an id-less option gets
the machine-generated key described above, so authors hand-write
`<input>_<value>` ids to get stable identity — as was done for the MTSU form A
content on 2026-09-07. The proposed fix is to derive the auto id from the
parent input id plus the value (`q1_true`), with an explicit `id=` still
winning. **Not extended in this commit.**

Note that (b) depends on (a): the auto id can only be built from the value once
the value can be inferred.

### (c) code from the default table — EXISTS (this commit)

`defaultCodes.ts` maps a small set of conventional values to their
conventional codes: `true`/`yes` → 1, `false`/`no`/`neutral` → 0, the signed
agreement scale `strongly_disagree` … `strongly_agree` → -2 … 2. Lookup folds
case and treats spaces and underscores as the same character. An explicit
`code=` always wins; a value the table does not know yields `undefined`, not a
guess.

The table is read through one function, `defaultCodeForValue(value,
reverseCoded)`, which also applies the item-level reversal described in (d).
What it returns is the **effective default**: what an option with no `code=`
is coded as, and what an explicit `code=` is measured against. Putting the
flip there rather than in each consumer is what keeps the `code` selector,
the `codes` selector, graders, and the typo guard from disagreeing about what
an item's options mean.

The keys are **values, not display labels**. `<Key value="agree"
code="-1">Zgadzam się</Key>` is the shape translated content takes: the label
is Polish, the value is not, and the value is what finds a default. This is
exactly why (a) is harder than it looks — inferring a value from translated
text would break the table's only stable input.

### (d) reversed items, and the typo guard — EXISTS (this commit)

A **reverse-coded item** (the psychometric term) is worded so that agreeing
with it means the opposite of agreeing with the rest of the scale. "Either
you are a writer or you are not" sits in a growth-mindset scale the wrong way
round: the learner who agrees is the one scoring low on the construct.

That is a fact about the ITEM, so it is declared on the item:

```xml
<ChoiceInput id="likert_fixed" reverseCoded="true">
  <Key value="strongly_agree">Strongly agree</Key>
  <Key value="agree">Agree</Key>
  <Key value="disagree">Disagree</Key>
  <Key value="strongly_disagree">Strongly disagree</Key>
</ChoiceInput>
```

`reverseCoded` negates the default table for that item's options — `agree` →
-1, `strongly_disagree` → 2 — so a reversed Likert item needs no per-option
`code=` at all. It is recording, not grading: a reversed item is still stored,
never marked.

Negation is plain arithmetic, which the boolean family survives badly:
`true` → -1 and `false` → 0 under `reverseCoded`. That is rarely what anyone
means, and it is exactly why a reversed true/false or yes/no item should
carry explicit codes rather than lean on the table.

The **typo guard** is the other half. An explicit code that disagrees with
the effective default is legal but suspect — it is what a fat-fingered
`code="11"` looks like — so it is a parse-time **warning**, never an error,
and the explicit code is used either way:

```
⚠️  <Key value="true" code="11">: code 11 differs from the default code 1 for "true"; explicit code is used — check for a typo.
```

**Nothing is exempt, least of all a flipped sign.** An earlier cut of this
let an exact negation through on the theory that it must be a reversal; that
is backwards. A dropped or doubled minus in a column of signed numbers is the
single easiest mistake to make and the one a machine is best placed to catch,
and "it might have been deliberate" describes every typo. Deliberate reversal
has its own spelling now — the item attribute — and the guard compares
against the negated default when it is set. So:

- a reversed item with `reverseCoded` and matching reversed codes: silent;
- a reversed item with `reverseCoded` and no codes at all: silent, and coded
  correctly;
- one un-reversed code left behind inside a `reverseCoded` item: **warns**,
  which is the half-finished reversal the old exemption could not see;
- reversed codes with no `reverseCoded` on the item: **warns**, since from
  the outside that is indistinguishable from four dropped minus signs.

The guard runs from the ITEM's parser, not from `Key`/`Distractor`: whether a
code is wrong depends on `reverseCoded=`, and an option's `validateAttributes`
is handed only its own attributes. (The same reason `NumberLineInput` checks
its `<Tick>` values from its own parser.) It descends through wrapper markup
and stops at a nested choice input, which is a different item. Options
reached only by `target=` belong to no item at parse time and are not
checked.

The zero-default values are unaffected throughout: zero is its own negation,
and an explicit nonzero code on `false`/`no`/`neutral` warns either way.

### (e) open questions

- **Locale.** The table is English keys on values. If (a) ever infers values
  from text, translated content must still land on English values, or the
  table must grow per-locale keys, or codes must stop depending on values at
  all. Unresolved.
- **Scope.** Is one platform-wide table right, or should a course, an
  instrument, or a single input carry its own? A 1–5 Likert convention and a
  signed −2…2 convention are both defensible, and the table can only hold one.
- **Graduation.** Does this stay a breadcrumb that fills in what authors
  omitted, or does it become the documented 1.0 contract that content may rely
  on? Content written today should keep writing `code=` explicitly — the
  MTSU journal items do — because the content file is the record of what the
  numbers mean. A reversed item is best written both ways: `reverseCoded` on
  the item states the intent, the explicit codes state the numbers, and a
  sign flip in either one is then caught by the other.

## Authored forms

| Authored | Parses today as | Should eventually parse as |
| --- | --- | --- |
| `<Key> True </Key>` | id `_<sha1>`, no value, no code; selection stores `CONTENT/_<sha1>` | `<Key id="q1_true" value="true" code="1">` |
| `<Key value="true"> True </Key>` | id `_<sha1>`, value `true`, **code 1 from the table** | `<Key id="q1_true" value="true" code="1">` |
| `<Key id="q1_true" value="true"> True </Key>` | value `true`, **code 1 from the table** | unchanged |
| `<Key value="agree" code="-1"> Agree </Key>` on a plain item | value `agree`, code −1, **warning** that the table says 1 | unchanged — say `reverseCoded="true"` on the item if it is meant |
| `<Key value="agree" code="-1"> Agree </Key>` inside `<ChoiceInput reverseCoded="true">` | value `agree`, code −1, no warning (the effective default) | unchanged — a reversed item, declared |
| `<Key value="agree"> Agree </Key>` inside `<ChoiceInput reverseCoded="true">` | value `agree`, **code −1 from the negated table** | unchanged — the shortest honest reversal |
| `<Key value="agree" code="11"> Agree </Key>` | value `agree`, code 11, **warning** that the table says 1 | unchanged — the explicit code still wins |
| `<Key value="zgadzam_sie"> Zgadzam się </Key>` | value `zgadzam_sie`, **no code** | no code — the table keys English values on purpose |
| `<Key value="mercury"> Mercury </Key>` | value `mercury`, no code | unchanged — most questions are not instruments and want no code |

The row that matters is the last one. Codes are for instruments; a
knowledge question has no code and should not acquire one by accident.
