# Navigator Block

## Overview

Navigator creates a two-pane interface with a searchable list on the left and a detail view on the right. Item data comes from YAML in the block's text content, while the visual presentation uses template blocks referenced by ID.

**Note**: This is a prototype block. The YAML parsing is simple and may not handle all edge cases.

## Technical Usage

### Basic Syntax
```xml
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

### Properties
- `id` (required): Unique identifier
- `title` (optional): Header text for the list pane
- `preview` (optional): ID of block to use for list item rendering
- `detail` (optional): ID of block to use for detail view rendering
- `searchable` (optional): Enable/disable search box, defaults to true

### YAML Data Format
Items are defined as YAML list entries in the block's text content:
```yaml
- id: unique_id
  name: Display Name
  role: Optional Role
  description: Longer description
  skills: [Skill 1, Skill 2, Skill 3]
```

Each field becomes an attribute passed to the template blocks.

### State
- `selectedItem`: ID of currently selected item
- `searchQuery`: Current search filter text

## Template Blocks

Navigator uses separate blocks for preview and detail views. This allows customization without modifying Navigator itself.

### Built-in Templates

#### NavigatorDefaultPreview
Simple preview showing title, subtitle, and truncated description.

#### NavigatorDefaultDetail
Generic detail view showing all fields with automatic formatting.

#### NavigatorTeamPreview
Team member preview with circular photo and name/role.

#### NavigatorTeamDetail
Full team member profile with photo, bio, experience, and skills.

#### NavigatorReadingDetail
For document/reading navigation, renders a referenced block.

### Creating Custom Templates
Template blocks receive all item data as props:
```jsx
function _MyCustomPreview(props) {
  const { name, role, customField } = props;
  return <div>{name} - {customField}</div>;
}
```

## Common Use Cases

### 1. Team Directory Navigation
Browse team members with photos and profiles:
```xml
<Navigator id="team" title="Team" preview="team_preview" detail="team_detail">
- id: alice
  name: Alice
  role: Manager
  photo: images/alice.png
</Navigator>
```

### 2. Document Library
Navigate through readings or resources:
```xml
<Navigator id="readings" title="Library" preview="reading_preview" detail="reading_detail">
- id: study1
  title: Research Study
  authors: Smith et al.
  ref: study1_content
</Navigator>
```

### 3. Task/Activity Selection
Let learners choose from available activities:
```xml
<Navigator id="activities" title="Choose Activity">
- id: brainstorm
  title: Brainstorming
  description: Generate ideas for the problem

- id: research
  title: Research
  description: Review literature
</Navigator>
```

## Example File
See `Navigator.olx` for a working example with team templates.
