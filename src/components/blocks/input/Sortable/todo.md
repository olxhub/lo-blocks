Template-driven expansion
=======

We should convert this to tempate-driven expansion. We'd like something along the lines of:

```
const SimpleSortable = createTemplateBlock({
    grammar: sortParser,
    template: `
      <CapaProblem>
        <Markdown>{{prompt}}</Markdown>
        <SortableGrader>
          <SortableInput>
            {{#each items}}
            <Markdown {{#if index}}index="{{index}}"{{/if}}>{{content}}</Markdown>
            {{/each}}
          </SortableInput>
        </SortableGrader>
      </CapaProblem>
    `
  });
```

This could feed into content templates in the future

Clean up PEG for multiline support. For example:
============

```
2. I am the very
model of a modern
1. major general. I've
information vegetable
3. animal and mineral
4. I know the kings of
England and I quote the
fights historical.
```

And no numbers (for shuffle, assumes single line).

Realtime display of correctness
============
Depending on use, students might want to see how close they are in realtime. This might be more of a CapaProblem architectural issue and feature than strictly a sortable one; we have something similar in TextHighlight

DragHandles
============
Allow dragging only on handles; this allows embedding of interactive content

Documentation
===========
Add this to the demo course, give examples, etc.