# Matching DSL Format

This documents the simple DSL (Domain Specific Language) format for authoring matching problems using `SimpleMatching` blocks.

## Overview

The matching DSL allows you to define matching pairs with a simple colon-separated format. Students match items from a left column to items in a right column.

## Basic Syntax

```
Optional Title
==============
left item: right item
left item: right item
left item: right item
```

- **Title (optional):** Write your title, then underline with `==` (at least two equals signs) on the next line
- **Pairs:** Each line has a left item, a colon `:`, and a right item
- **Blank lines:** Empty lines are ignored

## Without Title

```
Paris: France
Madrid: Spain
Rome: Italy
```

## With Title

```
Capital Matching
================
Paris: France
Madrid: Spain
Rome: Italy
```

## Format Rules

- **Colons as separators:** Use exactly one `:` to separate left and right items
- **Whitespace:** Spaces around colons are trimmed automatically
- **Blank lines:** Empty lines between pairs are ignored (useful for readability)
- **Left items:** Cannot contain colons (they mark the boundary)
- **Right items:** Can contain anything except newlines

Valid:
```
Renaissance (14th-17th century): Rebirth of classical learning and art
Medieval Period (5th-15th century): Middle Ages in Europe
Enlightenment (17th-18th century): Age of reason and scientific revolution
1400-1500: Early Modern Period
```

## Comprehensive Example

```
Historical Periods
==================
Early 1800s: Industrial Revolution
Mid to late 1800s: Victorian Era
1916: World War I
1930s: Great Depression
```

## AST Output

The parser produces a JSON structure:

```json
{
  "title": "Historical Periods",
  "pairs": [
    { "left": "Early 1800s", "right": "Industrial Revolution" },
    { "left": "Mid to late 1800s", "right": "Victorian Era" },
    { "left": "1916", "right": "World War I" },
    { "left": "1930s", "right": "Great Depression" }
  ]
}
```

## Usage in SimpleMatching Block

When you use the `SimpleMatching` block with this DSL, it automatically:
1. Parses the content
2. Creates a `MatchingInput` block with the pairs
3. Creates a `MatchingGrader` for assessment
4. Wraps everything in a `CapaProblem` for display and grading

## See Also

- [SimpleMatching Documentation](SimpleMatching.md)
- [MatchingInput Documentation](MatchingInput.md)
- [MatchingGrader Documentation](MatchingGrader.md)
