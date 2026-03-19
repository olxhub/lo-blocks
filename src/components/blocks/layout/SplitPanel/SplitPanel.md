# SplitPanel

Creates side-by-side layout with two panes, enabling spatial organization of content for enhanced learning experiences.

## Syntax

SplitPanel supports two naming conventions for panes:

### StartPane and EndPane (Use This First)
Use `StartPane` and `EndPane` for most layouts. These names automatically adapt to different languages:

- In English, Spanish, and most languages: StartPane appears on the left, EndPane on the right
- In Arabic, Hebrew, and other right-to-left languages: StartPane appears on the right, EndPane on the left

This is helpful for international content because the same content works for all languages without needing separate versions.

```olx:playground
<SplitPanel id="worked_example" sizes="55,45">
  <StartPane>
    <Markdown>
## Worked Example: Spacing Schedule

**Problem:** You need to remember vocabulary for a test in 30 days. How should you space your study sessions?

**Step 1:** Identify retention interval (30 days)

**Step 2:** Apply Cepeda et al.'s finding: optimal spacing ≈ 10-20% of retention interval

**Step 3:** Calculate: 30 days × 10-20% = 3-6 days between sessions
    </Markdown>
  </StartPane>
  <EndPane>
    <Markdown>
### Your Turn

Design a spacing schedule for remembering material for 60 days:
    </Markdown>
    <TextArea id="schedule" rows="4" placeholder="Describe your spacing plan..." />
  </EndPane>
</SplitPanel>
```

### LeftPane and RightPane (For Fixed Layouts)
Use `LeftPane` and `RightPane` only when the actual left/right position has meaning in your content.

**Examples where position matters:**
- **Anatomy:** Left and right sides of the heart, lungs, or brain
- **Geography:** Rivers flowing left to right, or maps where orientation matters
- **Culture:** Left-hand vs. right-hand practices or etiquette (Indian dining, Hindu rituals, Islamic traditions)
- **Diagrams:** Visual content with inherent direction (arrows pointing left/right, before/after diagrams)

```olx:playground
<SplitPanel id="anatomy_example" sizes="50,50">
  <LeftPane>
    <Markdown>
## Left Atrium

Receives oxygen-rich blood from the lungs through the **pulmonary veins**.

This chamber is smaller and has thinner walls than the left ventricle.
    </Markdown>
  </LeftPane>
  <RightPane>
    <Markdown>
## Right Atrium

Receives oxygen-poor blood from the body through the **superior and inferior vena cava**.

This is where blood returns before being pumped to the lungs.
    </Markdown>
  </RightPane>
</SplitPanel>
```

## Properties
- `id` (required): Unique identifier for the panel
- `sizes` (optional): Comma-separated percentages for first,second pane widths (default: "50,50")
- **Pane children** (required): Choose ONE approach:
  - **`<StartPane>` and `<EndPane>`** (Recommended): Automatically adapt to any language's text direction
  - **`<LeftPane>` and `<RightPane>`** (Use only when position matters): Stay in fixed positions regardless of language

  Do not mix StartPane/EndPane with LeftPane/RightPane in the same SplitPanel.

## Common Use Cases

### With StartPane + EndPane (Works for All Languages)

**1. Instruction + Practice**
- StartPane: Step-by-step instructions or worked examples
- EndPane: Interactive practice area for students to try

**2. Before & After (Sequence)**
- StartPane: Original state or problem
- EndPane: Final state or solution

**3. Content + References**
- StartPane: Main learning content
- EndPane: Glossary, notes, or quick reference

**4. Chat + Activities**
- StartPane: Conversational content (tutor, chatbot, or dialogue)
- EndPane: Dynamic activities that respond to the conversation

**5. Sidebar Navigation + Content**
- StartPane: Navigation menu, chapter list, or controls
- EndPane: Main content display

### With LeftPane + RightPane (Fixed Position - Use Only When Direction Matters)

Use **only** when left vs. right has a specific meaning in your content:

**Example: Left Hand vs. Right Hand**
- LeftPane: Gestures, techniques, or concepts specific to the left hand
- RightPane: Equivalent for the right hand

This matters because hand dominance, cultural significance, or anatomical differences make the position meaningful. (Similarly useful for diagrams, directional arrows, or other visual concepts where left/right orientation is inherent.)

