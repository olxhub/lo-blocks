# BlockIndex

Lists available blocks with their descriptions and categories, each linked
to its documentation page. This is the index component of the documentation
system, and it is an ordinary block — so an authoring course can embed a
block listing anywhere in courseware.

## Usage

List everything (all non-internal blocks):

```olx:code
<BlockIndex/>
```

List one or more categories:

```olx:playground
<BlockIndex categories="input,grading"/>
```

List an explicit set of blocks — useful for progressive reveal in an
authoring course, where each lesson introduces a few blocks:

```olx:code
<BlockIndex blocks="Markdown,TextArea,ActionButton"/>
```

`categories=` and `blocks=` combine (a block appears if it matches either).

## Progressive reveal

BlockIndex has no reveal logic of its own — gating is ordinary adaptive
content with `when=`, like any other block:

```olx:code
<BlockIndex blocks="Markdown,TextArea"/>
<BlockIndex when="@lesson2.correct == 'correct'" blocks="CapaProblem,NumericalGrader"/>
```

## Data source

Block metadata comes from the `get_blocks` MCP tool — descriptor-level
data only (names, descriptions, categories), so listing blocks never loads
their code.
