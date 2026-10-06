# Materialising a rubric

A rubric may contain templates. What the build writes out never does.

```
<ItemTemplate name="pair">
  <Slot key="is_{abbrev}" pts="2">Specifically {longName}</Slot>
  <Forbid key="excluded" ifDeclared="hasExtra"/>
</ItemTemplate>
<Item scores="thing_b" use="@pair" max="4" conditions="hasExtra"
      params="longName=Beta Kind|abbrev=b"/>
```

becomes

```
<Item scores="thing_b" max="4">
  <Slot key="is_b" pts="2">Specifically Beta Kind</Slot>
  <Forbid key="excluded"/>
</Item>
```

## Why expansion is build-time

Because more than one program reads the generated content, and each has its own
parser. If a template survived into that output, every reader would need the
template grammar — and a second implementation of one rule is the drift this
whole model exists to end.

Expanding once, in the build, means every reader sees ordinary items. The
duplication that results lives only in derived output nobody hand-edits.

## What it does

| step | rule |
|---|---|
| collect templates | two with one name is an error: keeping the last would make an edit to the first do nothing |
| resolve `use="@name"` | an item naming a template the rubric does not declare is an error |
| fill `{placeholders}` | from the item's `params`; a missing one is an error, not a hole |
| select children | a child with `ifDeclared="x"` survives only if the item declares `x`; `!x` inverts |
| drop the template | it was the source, not the output |
| pass untemplated items through | not every item is templated, and forcing them all through one would be worse than the helpers this replaces |

## `ifDeclared`, and why not `cond`

`cond` is **real data** on some rubric children: `<Onlyif key="x" cond="y">`
means *charge `x` only while `y` holds*. A template marker sharing that name is
read as the marker and stripped from the output as if it had been consumed,
which silently deletes the condition the charge depended on.

Found by materialising four real items end to end; the unit tests were green
because their fixtures had no child carrying its own `cond`. One word cannot mean
both *include this node* and *this check depends on that one*.

The same reasoning rules out `when`, which is a base attribute on every block and
already gates rendering by expression.

## `params` splits on the first `=` only

A value may contain one — a definition, a rule, a sentence with an equation in
it. Splitting on every `=` truncates it silently at the first.

## Warnings, which do not fail the build

| warning | usually means |
|---|---|
| params nothing asks for | a rename that half-landed; filling never touches them, so nothing else would mention it |
| a template no item uses | the last item that used it was edited or removed |

Neither changes what is written, which is why they are reported rather than
raised: a build that refuses on a stale parameter stops work for something that
alters no output.

## Keeping it current

The rules of substitution and selection live in `itemTemplate.ts` and are not
repeated here. This module resolves names, splits two attribute strings, and
calls the expander — if it starts making judgements of its own, they belong
there instead.

## Related

- **itemTemplate** — the expander, and the two operations
- **ItemTemplate**, **Item** — the blocks an author writes
