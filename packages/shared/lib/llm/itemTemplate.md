# Item templates

A template says *these items are the same shape*. The items say *how they differ*.

```
<ItemTemplate name="pair">
  <Question>Give an example of {longName}.</Question>
  <Slot key="is_{abbrev}" pts="2">Specifically {longName}</Slot>
  <Forbid key="excluded" cond="hasExtra"/>
</ItemTemplate>

<Item scores="thing_a" use="@pair" max="4"
      params="longName=Alpha Kind|abbrev=a"/>
<Item scores="thing_b" use="@pair" max="4" conditions="hasExtra"
      params="longName=Beta Kind|abbrev=b"/>
```

Two items, six lines each, one shared shape. `thing_b` gets the `<Forbid>`;
`thing_a` does not, and nothing anywhere lists which items are special.

## Why this exists when `Frame` already shares prose

`Frame` varies **words**. This varies **what the sheet asks**.

Measured on a twelve-item handout built from four helper functions: the item
pairs it produced were 92–100% identical once serialised, but three of the four
pairs differed in their **slot keys**, and one differed in a **credit key derived
from the parameter**. A prose mechanism cannot express that. Expanding the items
literally instead would have put roughly 86KB of near-duplicate content into the
authored source, where one shared sentence then needs twelve edits.

## Two operations, and only two

| operation | written as | the engine knows |
|---|---|---|
| substitution | `{name}`, anywhere — **including inside attribute values** | that a key was asked for and a value supplied |
| conditional child | `cond="name"` on a child; `!name` inverts | whether the item declared that name |

It never learns what a name *means*. That is what keeps a subject's vocabulary
out of the engine.

`key="is_{abbrev}"` is the case that forces substitution into attributes. A
mechanism that filled only text would produce the right prose attached to the
wrong slot — which scores nothing, matches nothing, and looks fine.

## Differences live on the item

Not in a list of ids, not in a table keyed by item. An item declares its own
`params` and `conditions`, and the template is inert without them.

The arrangement this replaced kept both: a helper's argument list **and**
module-level tuples naming which items had which property. Two places to say one
thing is two places to forget.

## An unsupplied placeholder is an error

Not an empty string, and not left literal. A template is a promise that every
hole is filled; a missing one ships prose reading `specifically {longName}`, or a
slot key of `is_` that scores nothing and matches nothing. The error names the
item and the node, because "missing parameter" alone does not tell you where.

`unusedParams()` reports the opposite case — a param no node asks for. Not fatal,
usually a half-landed rename, and invisible otherwise since filling never touches
it.

## Expansion is build-time and materialised

The build expands templates into literal items in the generated content. Readers
with their own parsers therefore see ordinary items and need no template grammar
at all — which matters wherever more than one program reads the same generated
file. The duplication lives only in derived output that nobody hand-edits.

## Keeping it current

A template used by one item is a template that should be an item. A condition no
template tests is a name doing no work, and a param no node asks for is reported
rather than silently ignored.

## Related

- **Frame** / **Segment** — the same two operations, applied to shared prose
- **Item** — declares `use`, `params` and `conditions`
