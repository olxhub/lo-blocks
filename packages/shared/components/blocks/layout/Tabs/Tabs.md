# Tabs

Creates a tabbed interface where each child block becomes a separate panel. Only one panel is visible at a time, with tab headers for navigation.

```olx:playground
<Tabs id="learning_theories">
  <Vertical title="Behaviorism">
    <Markdown>
**Behaviorism** focuses on observable behaviors and external stimuli.

Key figures: B.F. Skinner, Ivan Pavlov, Edward Thorndike

Core idea: Learning is a change in behavior resulting from stimulus-response associations.
    </Markdown>
  </Vertical>
  <Vertical title="Cognitivism">
    <Markdown>
**Cognitivism** focuses on internal mental processes.

Key figures: Jean Piaget, Jerome Bruner, David Ausubel

Core idea: Learning involves organizing information into mental schemas.
    </Markdown>
  </Vertical>
  <Vertical title="Constructivism">
    <Markdown>
**Constructivism** focuses on active knowledge construction.

Key figures: Lev Vygotsky, John Dewey

Core idea: Learners build understanding through experience and social interaction.
    </Markdown>
  </Vertical>
</Tabs>
```

## Properties
- `id` (required): Unique identifier for the tabs container

## Child Properties
Each child block's `title` attribute becomes the tab header text.

## State
- `activeTab`: ID of the selected child, persisted across sessions. Tabs stores
  identity rather than position, so hiding an earlier child with `when=` does
  not move the learner to a different tab.

Only the active panel is mounted. Switching tabs unmounts the previous panel,
so child lifecycle behavior such as `OnShow trigger="each_view"` follows what
the learner can actually see.

## Common Use Cases

### Multi-View Content
Present the same topic from different angles:

```olx:playground
<Tabs id="views">
  <Vertical title="Overview">
    <Markdown>The testing effect (retrieval practice) shows that actively recalling information strengthens memory more than passive review.</Markdown>
  </Vertical>
  <Vertical title="Research">
    <Markdown>Roediger &amp; Karpicke (2006) found students who took practice tests retained 50% more material after one week than those who restudied.</Markdown>
  </Vertical>
  <Vertical title="Application">
    <Markdown>Use low-stakes quizzes, flashcards, and self-testing to leverage the testing effect in your classroom.</Markdown>
  </Vertical>
</Tabs>
```

### Workspace Organization
Structure complex activities with dedicated areas:

```olx:playground
<Tabs id="workspace">
  <Vertical title="Task">
    <Markdown>Design a 10-minute active learning activity for teaching photosynthesis.</Markdown>
    <TextArea id="plan" rows="4" placeholder="My activity will..." />
  </Vertical>
  <Vertical title="Resources">
    <Markdown>
**Active Learning Strategies:**
- Think-Pair-Share
- Concept mapping
- Peer instruction
- Case studies
    </Markdown>
  </Vertical>
  <Vertical title="Rubric">
    <Markdown>
Your activity will be evaluated on:
- Student engagement level (ICAP framework)
- Alignment with learning objectives
- Feasibility within time constraints
    </Markdown>
  </Vertical>
</Tabs>
```

### Comparison Tasks
Compare options without side-by-side layout:

```olx:playground
<Tabs id="compare">
  <Vertical title="Traditional">
    <Markdown>
**Traditional Lecture**
- Teacher talks, students listen
- Information transfer model
- Hake's study: ~0.23 normalized gain
    </Markdown>
  </Vertical>
  <Vertical title="Interactive">
    <Markdown>
**Interactive Engagement**
- Students actively participate
- Peer discussion, problem-solving
- Hake's study: ~0.48 normalized gain
    </Markdown>
  </Vertical>
  <Vertical title="Your Analysis">
    <Markdown>Which approach would you use for teaching Newton's Laws? Why?</Markdown>
    <TextArea id="analysis" rows="3" />
  </Vertical>
</Tabs>
```

## Related Blocks
- **Sequential**: Linear progression (vs. random access)
- **Navigator**: More complex navigation patterns
- **SplitPanel**: Side-by-side layout
