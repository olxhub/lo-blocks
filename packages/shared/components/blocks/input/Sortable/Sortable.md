# Sortable Components

A comprehensive drag-and-drop sortable system for creating interactive ordering exercises.

**NOTE: This document is currently unshown in the documentation. We are figuring out how to clean up documentation of related components, and that's for a future PR.**

## Overview

The Sortable system provides flexible components for creating problems where learners arrange items in correct order. It supports multiple input methods, grading algorithms, and display options.

## Components

### Core Components

- **`SortableInput`** - The interactive drag-and-drop interface
- **`SortableGrader`** - Grades student arrangements with multiple algorithms
- **`SimpleSortable`** - Simplified PEG-based authoring format

### Architecture

```
CapaProblem
└── SortableGrader (handles grading logic)
    ├── TextBlock/Markdown (prompt/instructions)
    └── SortableInput (interactive interface)
        ├── TextBlock/Markdown (item 1)
        ├── TextBlock/Markdown (item 2)
        └── ... (more items)
```

## Basic Usage

### XML Format

```olx:playground
<CapaProblem id="study_strategies" title="Study Strategies">
  <SortableGrader>
    <Markdown>Sort these study strategies by their effectiveness (according to Dunlosky et al. 2013):</Markdown>
    <SortableInput>
      <Markdown>Practice testing (high utility)</Markdown>
      <Markdown>Distributed practice (high utility)</Markdown>
      <Markdown>Elaborative interrogation (moderate utility)</Markdown>
      <Markdown>Highlighting (low utility)</Markdown>
    </SortableInput>
  </SortableGrader>
</CapaProblem>
```

### SimpleSortable Format (Recommended)

```olx:playground
<SimpleSortable id="per_history" title="PER Milestones">
Put these physics education research milestones in order:
===
1. Force Concept Inventory developed by Halloun & Hestenes (1985)
2. Hake's study of 6000 students finds interactive > traditional (1998)
3. Freeman meta-analysis confirms active learning benefits (2014)
</SimpleSortable>
```

## Display Order Control

### Default Behavior (Shuffled)

Items are displayed in random order but graded against XML order:

```olx:code
<SortableInput>
  <Markdown>Encoding</Markdown>     <!-- Correct: position 1 -->
  <Markdown>Storage</Markdown>      <!-- Correct: position 2 -->
  <Markdown>Retrieval</Markdown>    <!-- Correct: position 3 -->
  <Markdown>Application</Markdown>  <!-- Correct: position 4 -->
</SortableInput>
```

### Controlled Display Order

Use `initialPosition` attributes to specify initial display positions:

```olx:code
<SortableInput>
  <!-- XML order is still the correct answer -->
  <Markdown initialPosition="3">Encoding</Markdown>     <!-- Display 3rd -->
  <Markdown initialPosition="1">Storage</Markdown>      <!-- Display 1st -->
  <Markdown initialPosition="4">Retrieval</Markdown>    <!-- Display 4th -->
  <Markdown initialPosition="2">Application</Markdown>  <!-- Display 2nd -->
</SortableInput>
```

### Partial Control

Mix indexed and unindexed items for flexible authoring:

```olx:code
<SortableInput>
  <!-- First item always shows first as a hint -->
  <Markdown initialPosition="1">Practice testing (effect size: 0.70)</Markdown>
  <!-- Others are shuffled into remaining positions -->
  <Markdown>Distributed practice</Markdown>
  <Markdown>Elaborative interrogation</Markdown>
  <Markdown>Highlighting</Markdown>
</SortableInput>
```

## SimpleSortable PEG Format

### Basic Syntax

```
[Prompt text]
===
[Item 1]
[Item 2]
[Item 3]
```

### With Display Order Control

```
Order these by effectiveness (highest to lowest):
===
3. Practice testing
1. Highlighting
4. Distributed practice
2. Rereading
```

**How it works:**
- Items in XML order = correct answer (Practice testing, Highlighting, Distributed practice, Rereading)
- Numbers control initial display (Highlighting 1st, Rereading 2nd, Practice testing 3rd, Distributed practice 4th)

## Advanced Features

### Grading Algorithms

```olx:code
<SortableGrader algorithm="exact">          <!-- Default: all-or-nothing -->
<SortableGrader algorithm="partial">        <!-- Partial credit -->
<SortableGrader algorithm="adjacent">       <!-- Adjacent pair relationships -->
<SortableGrader algorithm="spearman">       <!-- Rank correlation -->
```

### Configuration Options

```olx:code
<SortableInput dragMode="whole">            <!-- Default: drag entire item -->
<SortableInput dragMode="handle">           <!-- Show drag handles -->
<SortableInput shuffle="false">             <!-- Don't shuffle (use XML order) -->
```

## Design Principles

### Correct Order Philosophy

**The XML document order is always the correct answer.** This creates predictable, maintainable content:

- **Easy to author**: Write items in correct order
- **Easy to review**: Correct answer is visible in source
- **Version control friendly**: Logical diffs when items change
- **Maintainable**: No hidden state or complex ID mappings

### Display vs. Logic Separation

- **Logic** (grading): Based on XML order
- **Display** (initial arrangement): Controlled by `initialPosition` attributes or shuffle
- **State** (current arrangement): Array of indices `[0,1,2,3]`

This separation allows flexible presentation without affecting grading logic.

## Troubleshooting

### Common Issues

**Items not grading correctly**
- Verify XML order matches intended correct answer
- Check that all items are properly nested in SortableInput

**Display order not working**
- Ensure `initialPosition` attributes are 1-based (not 0-based)
- Verify no duplicate initialPosition values

**SimpleSortable not parsing**
- Check separator line has adequate `=` characters
- Ensure proper spacing around separator
- Verify content doesn't have syntax conflicts

### Debugging

Use the `xml2json` script to inspect parsed structure:
```bash
npm run xml2json -- --out debug.json
```

## Related Components

- **ChoiceInput**: For multiple choice questions
- **TextHighlight**: For text selection exercises
- **CapaProblem**: Problem container with automatic grading buttons

