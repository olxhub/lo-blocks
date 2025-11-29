# Collapsible Block

## Overview

Collapsible creates expandable/collapsible sections that hide content until clicked. Useful for optional information, progressive disclosure, or organizing dense content without overwhelming learners.

## Technical Usage

### Basic Syntax
```xml
<Collapsible id="hints" title="Show Hint">
  <Markdown>Here's a helpful hint...</Markdown>
</Collapsible>
```

### Properties
- `id` (required): Unique identifier
- `title` or `label`: Header text shown in the collapsed state

### State
- `expanded`: Boolean tracking whether section is open or closed, persisted across sessions

## Common Use Cases

### 1. Hints and Help
Provide optional help without cluttering the main content:
```xml
<Collapsible title="Need a hint?">
  <Markdown>Consider the relationship between...</Markdown>
</Collapsible>
```

### 2. Additional Resources
Hide supplementary materials that some learners may want:
```xml
<Collapsible title="Further Reading">
  <Markdown>- [Article 1](...)
- [Article 2](...)</Markdown>
</Collapsible>
```

### 3. Worked Examples
Let learners attempt problems before revealing solutions:
```xml
<Collapsible title="Show Solution">
  <Markdown>Step 1: First we...</Markdown>
</Collapsible>
```

### 4. Dense Reference Material
Organize reference information without visual overload:
```xml
<Collapsible title="API Reference">
  <!-- Detailed documentation -->
</Collapsible>
```

### 5. Nested Organization
Collapsible sections can be nested for hierarchical content:
```xml
<Collapsible title="Chapter 1">
  <Collapsible title="Section 1.1">...</Collapsible>
  <Collapsible title="Section 1.2">...</Collapsible>
</Collapsible>
```

## Example File
See `Collapsible.olx` for working examples of basic usage and nested sections.
