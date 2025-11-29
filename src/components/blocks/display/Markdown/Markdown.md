# Markdown Block

## Overview

The Markdown block renders text using Markdown formatting with GitHub-Flavored Markdown (GFM) support. It provides rich text display including headers, lists, links, code blocks, tables, and more.

## Technical Usage

### Basic Syntax
```xml
<Markdown id="intro">
# Welcome

This is **bold** and *italic* text.

- List item 1
- List item 2
</Markdown>
```

### External File
```xml
<Markdown id="article" src="content/article.md"/>
```

### Properties
- `id` (optional): Unique identifier for the block
- `src` (optional): Path to an external markdown file

### Supported Markdown Features
- Headers (`#`, `##`, `###`, etc.)
- Bold (`**text**`) and italic (`*text*`)
- Links (`[text](url)`)
- Images (`![alt](src)`)
- Code blocks (fenced with triple backticks)
- Inline code (single backticks)
- Ordered and unordered lists
- Tables (GFM)
- Strikethrough (`~~text~~`)
- Task lists (`- [ ]` and `- [x]`)

## Pedagogical Purpose

Markdown provides a natural way to author educational content:

1. **Readable Source**: Content is readable even in raw form
2. **Focus on Content**: Authors focus on structure, not formatting
3. **Familiar Format**: Standard format used across many platforms
4. **Maintainability**: Easy to update and version control

## Common Use Cases

### Instructional Text
Present concepts, explanations, and instructions to learners.

### Formatted Problem Statements
Structure complex problem descriptions with headers and lists.

### Rich Feedback
Provide structured feedback with examples and code snippets.

## Example File
See `Markdown.olx` for working examples.
