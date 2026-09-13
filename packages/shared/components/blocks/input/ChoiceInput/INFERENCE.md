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

The keys are **values, not display labels**. `<Key value="agree"
code="-1">Zgadzam się</Key>` is the shape translated content takes: the label
is Polish, the value is not, and the value is what finds a default. This is
exactly why (a) is harder than it looks — inferring a value from translated
text would break the table's only stable input.

### (d) the typo guard — EXISTS (this commit)

An explicit code that disagrees with the default for its own value is legal
and necessary (that IS a reversed item), but it is also what a fat-fingered
`code="11"` looks like. So it is a parse-time **warning**, never an error, and
the explicit code is used either way:

```
⚠️  <Key value="true" code="11">: code 11 differs from the default code 1 for "true"; explicit code is used — check for a typo.
```

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
  numbers mean.

## Authored forms

| Authored | Parses today as | Should eventually parse as |
| --- | --- | --- |
| `<Key> True </Key>` | id `_<sha1>`, no value, no code; selection stores `CONTENT/_<sha1>` | `<Key id="q1_true" value="true" code="1">` |
| `<Key value="true"> True </Key>` | id `_<sha1>`, value `true`, **code 1 from the table** | `<Key id="q1_true" value="true" code="1">` |
| `<Key id="q1_true" value="true"> True </Key>` | value `true`, **code 1 from the table** | unchanged |
| `<Key value="agree" code="-1"> Agree </Key>` | value `agree`, code −1, **warning** that the table says 1 | unchanged (a reversed item; the warning is the guard doing its job) |
| `<Key value="zgadzam_sie"> Zgadzam się </Key>` | value `zgadzam_sie`, **no code** | no code — the table keys English values on purpose |
| `<Key value="mercury"> Mercury </Key>` | value `mercury`, no code | unchanged — most questions are not instruments and want no code |

The row that matters is the last one. Codes are for instruments; a
knowledge question has no code and should not acquire one by accident.
