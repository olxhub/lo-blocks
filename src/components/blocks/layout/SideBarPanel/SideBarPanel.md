# SideBarPanel

Two-column layout with a main content area and a sidebar. Content is organized using `<MainPane>` and `<Sidebar>` child elements.

```olx:playground
<SideBarPanel id="chunking_lesson">
  <MainPane>
    <Markdown>
## Chunking and Expertise

Chess masters can glance at a board for seconds and recreate piece positions with near-perfect accuracy—but only for *realistic* game positions. For randomly placed pieces, they perform no better than novices.

The difference? Experts chunk meaningful patterns. A master sees "kingside castling structure" where a novice sees eight separate pieces.
    </Markdown>
    <Markdown>What implications does this have for how we teach beginners?</Markdown>
    <TextArea id="implications" rows="3" placeholder="Your thoughts..." />
  </MainPane>
  <Sidebar>
    <Markdown>
### Key Concepts

**Chunking**: Grouping information into meaningful units

**Cognitive load**: Working memory holds ~4 chunks at once

**Expert blindspot**: Experts forget what it's like not to see patterns

*Source: How People Learn (NRC, 2000)*
    </Markdown>
  </Sidebar>
</SideBarPanel>
```

## Syntax

```olx:code
<SideBarPanel>
  <MainPane>
    <Markdown>Main content here</Markdown>
  </MainPane>
  <Sidebar>
    <Markdown>Sidebar content</Markdown>
  </Sidebar>
</SideBarPanel>
```

## Properties
- `id` (optional): Unique identifier

## Named Slots
- `<MainPane>`: Primary content area (left/main column)
- `<Sidebar>`: Secondary content area (right sidebar)

Both slots can contain multiple child blocks.

## Pedagogical Purpose

Sidebars support learning scaffolds:

1. **Supplementary Information**: Notes, hints, or reference material
2. **Progress Tracking**: Show history or status alongside content
3. **Tools Access**: Keep tools visible while working
4. **Contextual Help**: Provide assistance without interrupting flow
5. **LLM Output**: Feedback on main panel work
6. **Navigation**: To related resources

## Common Use Cases

### Content with Reference

```olx:playground
<SideBarPanel>
  <MainPane>
    <Markdown>If you need to remember something for a test in one month, how far apart should you space your study sessions?</Markdown>
    <NumberInput id="days" placeholder="days" />
  </MainPane>
  <Sidebar>
    <Markdown>
### Formula Reference

Optimal spacing ≈ 10-20% of retention interval

*Source: Cepeda et al. (2008)*
    </Markdown>
  </Sidebar>
</SideBarPanel>
```

### Problem with Hints

```olx:playground
<SideBarPanel>
  <MainPane>
    <CapaProblem id="quiz" title="Study Strategies">
      <KeyGrader>
        Which study strategy has the highest effect size according to Dunlosky et al. (2013)?
        <ChoiceInput>
          <Distractor>Highlighting</Distractor>
          <Key>Practice testing</Key>
          <Distractor>Rereading</Distractor>
        </ChoiceInput>
      </KeyGrader>
    </CapaProblem>
  </MainPane>
  <Sidebar>
    <Markdown>
### Hint

Think about which strategy requires active recall...
    </Markdown>
  </Sidebar>
</SideBarPanel>
```

## Related Blocks
- **SplitPanel**: Configurable column proportions
- **Vertical**: Simple vertical stacking

