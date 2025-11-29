# Tabs Block

## Overview

Tabs creates a tabbed interface where each child block becomes a separate panel. Only one panel is visible at a time, with tab headers for navigation. Useful for organizing related content without vertical scrolling.

## Technical Usage

### Basic Syntax
```xml
<Tabs id="myTabs">
  <Vertical id="tab1" label="First Tab">
    <!-- Content for first tab -->
  </Vertical>
  <Vertical id="tab2" label="Second Tab">
    <!-- Content for second tab -->
  </Vertical>
</Tabs>
```

### Properties
- `id` (required): Unique identifier for the tabs container

### Child Properties
Each child block's `label` or `title` attribute becomes the tab header text. If neither is provided, tabs are numbered "Tab 1", "Tab 2", etc.

### State
- `activeTab`: Index of currently selected tab, persisted across sessions

## Common Use Cases

### 1. Multi-View Content
Present the same topic from different angles:
```xml
<Tabs id="learning_views">
  <Vertical label="Video"><!-- Video content --></Vertical>
  <Vertical label="Text"><!-- Written explanation --></Vertical>
  <Vertical label="Interactive"><!-- Simulation --></Vertical>
</Tabs>
```

### 2. Workspace Organization
Structure complex activities with dedicated areas:
```xml
<Tabs id="workspace">
  <Vertical label="Current Activity"><!-- Active work --></Vertical>
  <Vertical label="Notes"><!-- Student notes --></Vertical>
  <Vertical label="Resources"><!-- Reference materials --></Vertical>
</Tabs>
```

### 3. Step-by-Step with Random Access
Unlike Sequential, tabs allow jumping directly to any step:
```xml
<Tabs id="process">
  <Vertical label="Step 1: Research">...</Vertical>
  <Vertical label="Step 2: Draft">...</Vertical>
  <Vertical label="Step 3: Review">...</Vertical>
</Tabs>
```

### 4. Artifact Building
Track accumulated work across an activity:
```xml
<Tabs id="artifact">
  <Vertical label="Problem Statement">...</Vertical>
  <Vertical label="Evidence">...</Vertical>
  <Vertical label="Conclusion">...</Vertical>
</Tabs>
```

### 5. Comparison Tasks
Side-by-side isn't always ideal; tabs can compare sequentially:
```xml
<Tabs id="compare">
  <Vertical label="Option A">...</Vertical>
  <Vertical label="Option B">...</Vertical>
  <Vertical label="Your Analysis">...</Vertical>
</Tabs>
```

## Example File
See `Tabs.olx` for working examples including interactive content within tabs.
