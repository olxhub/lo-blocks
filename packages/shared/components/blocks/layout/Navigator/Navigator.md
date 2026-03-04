# Navigator

Creates a two-pane interface with a searchable list on the left and a detail view on the right. Item data comes from YAML in the block's text content, while the visual presentation uses template blocks referenced by ID.

**Note**: This is a prototype block. The YAML parsing is simple and may not handle all edge cases.

## Basic Syntax

```olx:code
<Navigator id="my_nav" title="Items" preview="preview_template" detail="detail_template">
- id: item1
  name: First Item
  description: Description here

- id: item2
  name: Second Item
  description: Another description
</Navigator>

<Hidden>
  <NavigatorDefaultPreview id="preview_template"/>
  <NavigatorDefaultDetail id="detail_template"/>
</Hidden>
```

## Properties
- `id` (required): Unique identifier
- `title` (optional): Header text for the list pane
- `preview` (optional): ID of block to use for list item rendering
- `detail` (optional): ID of block to use for detail view rendering
- `searchable` (optional): Enable/disable search box, defaults to true

## YAML Data Format

Items are defined as YAML list entries in the block's text content:

```yaml
- id: unique_id
  name: Display Name
  role: Optional Role
  description: Longer description
  skills: [Skill 1, Skill 2, Skill 3]
```

Each field becomes an attribute passed to the template blocks.

## State
- `selectedItem`: ID of currently selected item
- `searchQuery`: Current search filter text

## Template Blocks

Navigator uses separate blocks for preview and detail views. This allows customization without modifying Navigator itself.

### Built-in Templates

- **NavigatorDefaultPreview**: Simple preview showing title, subtitle, and truncated description
- **NavigatorDefaultDetail**: Generic detail view showing all fields with automatic formatting
- **NavigatorTeamPreview**: Team member preview with circular photo and name/role
- **NavigatorTeamDetail**: Full team member profile with photo, bio, experience, and skills
- **NavigatorReadingDetail**: For document/reading navigation, renders a referenced block

## Common Use Cases

### Team Directory Navigation

```olx:code
<Navigator id="team" title="Research Team" preview="team_preview" detail="team_detail">
- id: roediger
  name: Henry Roediger
  role: Memory Researcher
  description: Known for research on the testing effect

- id: karpicke
  name: Jeffrey Karpicke
  role: Learning Scientist
  description: Studies retrieval practice and learning
</Navigator>
```

### Document Library

```olx:code
<Navigator id="readings" title="Key Studies" preview="reading_preview" detail="reading_detail">
- id: study1
  title: Testing Effect (2006)
  authors: Roediger & Karpicke
  ref: study1_content

- id: study2
  title: Spacing Effect Meta-analysis
  authors: Cepeda et al.
  ref: study2_content
</Navigator>
```

### Activity Selection

```olx:code
<Navigator id="activities" title="Learning Activities">
- id: retrieval
  title: Retrieval Practice
  description: Test yourself on the material without looking at notes

- id: spacing
  title: Spaced Review
  description: Plan review sessions spread over time
</Navigator>
```

