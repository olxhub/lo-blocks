# Sortable Components

A comprehensive drag-and-drop sortable system for creating interactive ordering exercises.

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

```xml
<CapaProblem id="ProgrammingLanguages">
  <SortableGrader>
    <TextBlock>Sort these programming languages by when they were first created:</TextBlock>
    <SortableInput>
      <!-- Items in correct chronological order -->
      <TextBlock>C++ (1985)</TextBlock>
      <TextBlock>Python (1991)</TextBlock>
      <TextBlock>Java (1995)</TextBlock>
      <TextBlock>JavaScript (1995)</TextBlock>
    </SortableInput>
  </SortableGrader>
</CapaProblem>
```

### SimpleSortable Format (Recommended)

```xml
<SimpleSortable id="ProgrammingLanguages">
Order these programming languages by when they were first created:
================================================================
C++ (1985)
Python (1991)
Java (1995)
JavaScript (1995)
</SimpleSortable>
```

## Display Order Control

### Default Behavior (Shuffled)
Items are displayed in random order but graded against XML order:

```xml
<SortableInput>
  <TextBlock>Mercury</TextBlock>  <!-- Correct: position 1 -->
  <TextBlock>Venus</TextBlock>    <!-- Correct: position 2 -->
  <TextBlock>Earth</TextBlock>    <!-- Correct: position 3 -->
  <TextBlock>Mars</TextBlock>     <!-- Correct: position 4 -->
</SortableInput>
```

### Controlled Display Order
Use `initialPosition` attributes to specify initial display positions:

```xml
<SortableInput>
  <!-- XML order is still the correct answer -->
  <TextBlock initialPosition="3">Mercury</TextBlock>  <!-- Display 3rd -->
  <TextBlock initialPosition="1">Venus</TextBlock>    <!-- Display 1st -->
  <TextBlock initialPosition="4">Earth</TextBlock>    <!-- Display 4th -->
  <TextBlock initialPosition="2">Mars</TextBlock>     <!-- Display 2nd -->
</SortableInput>
```

### Partial Control
Mix indexed and unindexed items for flexible authoring:

```xml
<SortableInput>
  <!-- Java always shows first as a hint -->
  <TextBlock initialPosition="1">Java (1995)</TextBlock>
  <!-- Others are shuffled into remaining positions -->
  <TextBlock>C++ (1985)</TextBlock>
  <TextBlock>Python (1991)</TextBlock>
  <TextBlock>JavaScript (1995)</TextBlock>
</SortableInput>
```

## SimpleSortable PEG Format

### Basic Syntax

```
[Prompt text]
================
[Item 1]
[Item 2]
[Item 3]
```

### With Display Order Control

```
Order these web technologies by creation date:
============================================
3. HTML (1993)
1. JavaScript (1995)
4. CSS (1996)
2. AJAX (2005)
```

**How it works:**
- Items in XML order = correct answer (HTML, JavaScript, CSS, AJAX)
- Numbers control initial display (JavaScript 1st, AJAX 2nd, HTML 3rd, CSS 4th)

## Advanced Features

### Grading Algorithms

```xml
<SortableGrader algorithm="exact">          <!-- Default: all-or-nothing -->
<SortableGrader algorithm="partial">        <!-- Partial credit -->
<SortableGrader algorithm="adjacent">       <!-- Adjacent pair relationships -->
<SortableGrader algorithm="spearman">       <!-- Rank correlation -->
```

### Configuration Options

```xml
<SortableInput dragMode="whole">            <!-- Default: drag entire item -->
<SortableInput dragMode="handle">           <!-- Show drag handles -->
<SortableInput shuffle="false">             <!-- Don't shuffle (use XML order) -->
```

## Design Principles

### Correct Order Philosophy
**The XML document order is always the correct answer.** This creates predictable, maintainable content:

- ✅ **Easy to author**: Write items in correct order
- ✅ **Easy to review**: Correct answer is visible in source
- ✅ **Version control friendly**: Logical diffs when items change
- ✅ **Maintainable**: No hidden state or complex ID mappings

### Display vs. Logic Separation
- **Logic** (grading): Based on XML order
- **Display** (initial arrangement): Controlled by `initialPosition` attributes or shuffle
- **State** (current arrangement): Array of indices `[0,1,2,3]`

This separation allows flexible presentation without affecting grading logic.

### Authoring Workflow
1. **Write items in correct order** in XML
2. **Add initialPosition attributes** if you want specific initial display
3. **Choose grading algorithm** based on pedagogical needs
4. **Test with different arrangements** to verify grading

## Examples

### Example 1: Basic Chronological Sorting

```xml
<SimpleSortable id="WebTechnologies">
Put these web technologies in order of creation:
==============================================
HTML (1993)
JavaScript (1995)
CSS (1996)
AJAX (2005)
</SimpleSortable>
```

### Example 2: Controlled Display with Hint

```xml
<CapaProblem id="Planets">
  <SortableGrader>
    <TextBlock>Order these planets by distance from the sun:</TextBlock>
    <SortableInput>
      <!-- Mercury always shown first as a hint -->
      <TextBlock initialPosition="1">Mercury</TextBlock>
      <!-- Others shuffled -->
      <TextBlock>Venus</TextBlock>
      <TextBlock>Earth</TextBlock>
      <TextBlock>Mars</TextBlock>
    </SortableInput>
  </SortableGrader>
</CapaProblem>
```

### Example 3: Complex Multi-line Content

```xml
<SimpleSortable id="ProcessSteps">
Arrange these software development steps in order:
================================================
Requirements gathering and analysis
System design and architecture
Implementation and coding
Testing and quality assurance
Deployment and maintenance
</SimpleSortable>
```

## Implementation Details

### State Management
- **Arrangement**: `[2, 0, 3, 1]` - Array of indices representing current order
- **Submitted**: `boolean` - Whether student has submitted their answer
- **Grading**: External component compares arrangement to `[0, 1, 2, 3]`

### Component Architecture
- **SortableInput**: Handles drag-and-drop interaction and state
- **SortableGrader**: Processes input state and determines correctness
- **SimpleSortable**: Parse-time macro that expands to full component hierarchy

### Parsing Pipeline (SimpleSortable)
1. **PEG Parser**: Text format → `{ prompt, items }`
2. **Component Generation**: Creates CapaProblem → SortableGrader → SortableInput → Markdown blocks
3. **ID Management**: Auto-generates unique IDs and maintains relationships
4. **Store Entries**: Multiple `storeEntry` calls create full component tree

## Next Steps & Planned Features

### Short Term
- **Drag handles**: `<SortableInput dragMode="handle">` for complex content
- **Multiline PEG support**: Better grammar for items spanning multiple lines
- **Additional grader variants**: Specific algorithm components

### Medium Term
- **Template system**: Replace manual component generation with declarative templates
- **Rich content support**: Images, videos, interactive elements in sortable items
- **Accessibility improvements**: Keyboard navigation, screen reader support
- **Mobile optimization**: Touch-friendly interactions

### Long Term
- **Real-time correctness display**: Show correctness as students drag
- **Adaptive hints**: Progressive disclosure based on student attempts
- **Analytics integration**: Track common mistake patterns
- **Template library**: Pre-built sortable patterns for common use cases

### API Evolution
The current manual `storeEntry` approach will likely evolve to a template-based system. See todo.md.

This would use templating engines (Handlebars/Mustache) for cleaner, more maintainable block development, and allow teacher-authored blocks.

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

This shows the complete component tree and can help identify parsing or structural issues.

## File Organization

```
src/components/blocks/Sortable/
├── Sortable.md                    # This documentation
├── SortableInput.js               # Main block definition
├── _SortableInput.jsx             # React component
├── SortableGrader.js              # Grading component
├── SimpleSortable.js              # PEG-based authoring
├── gradingUtils.js                # Grading algorithms
├── sort.pegjs                     # PEG grammar
├── _sortParser.js                 # Generated parser
└── examples/                      # Example files
    └── planets.sortpeg
```

## Related Components

- **ChoiceInput**: For multiple choice questions
- **TextHighlight**: For text selection exercises
- **CapaProblem**: Problem container with automatic grading buttons