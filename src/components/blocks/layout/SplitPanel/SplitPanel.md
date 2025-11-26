# SplitPanel Block

## Overview

SplitPanel creates side-by-side layout with two panes, enabling spatial organization of content for enhanced learning experiences.

## Technical Usage

### Basic Syntax
```xml
<SplitPanel id="myPanel" sizes="60,40">
  <LeftPane>
    <!-- Content for left side -->
  </LeftPane>
  <RightPane>
    <!-- Content for right side -->
  </RightPane>
</SplitPanel>
```

### Properties
- `id` (required): Unique identifier for the panel
- `sizes` (optional): Comma-separated percentages for left,right widths (default: "50,50")
- Both LeftPane and RightPane are required child elements

## Common Use Cases

### 1. Instruction + Practice
- Left: Step-by-step instructions or examples
- Right: Interactive practice area or workspace

### 2. Chat + Activities
- Left: Conversational content or dialogue (e.g. SBA or LLM)
- Right: Dynamic activities that respond to conversation progress

### 3. Content + References
- Left: Main learning content
- Right: Glossary, notes, or quick reference materials

### 4. Comparison Tasks
- Left: Option A or Case Study 1
- Right: Option B or Case Study 2

### 5: LLM Feedback
- Left: Student activity
- Right: LLM feedback on above

### 6: Navigation
- Left: System navigation
- Right: Content

### 7: Controls
- Left: Controls and settings
- Right: Content being modified by controls

Note that in most cases, these should move to semantic blocks in the future (which might alias to SplitPanel, but where the design may change in the future).

## Example File
See `SplitPanel.olx` for working examples of different split ratios and content types.