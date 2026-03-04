# TeamDirectory Block

## Overview

TeamDirectory displays an interactive roster of team members with grid and detail views. Users can browse the team in a card grid, then click to see full profiles. Designed for scenario-based assessments where learners interact with simulated team members.

**Note**: This is currently a prototype block. The team data is hardcoded for the Comm360 interdisciplinary SBA. Future versions will support custom team definitions via OLX children.

## Technical Usage

### Basic Syntax
```xml
<TeamDirectory id="team" title="Our Team"/>
```

### Properties
- `id` (required): Unique identifier
- `title` (optional): Header text, defaults to "Team Directory"

### State
- `selectedMember`: ID of currently selected team member (null for none)
- `viewMode`: Either "grid" (card overview) or "detail" (full profile)

## Current Team Data

The block currently displays the Comm360 intern team:
- **Ty** - Intern focusing on data analysis
- **Peggy** - Intern specializing in community outreach
- **Lacy** - Intern focused on program development
- **Lianne Park** - Supervisor/Mentor, Director
- **Anne Hastings** - CEO

Each member includes photo, role, bio, experience, and skills.

## Common Use Cases

### 1. SBA Team Introduction
Introduce learners to simulated colleagues they'll work with:
```xml
<TeamDirectory id="comm360_team" title="Meet Your Team"/>
```

### 2. Role-Play Scenarios
Help learners understand who to consult for different questions.

### 3. Organizational Context
Provide background on the simulated organization's structure.

## Future Enhancements

Planned improvements:
- Custom team data via child `<TeamMember>` blocks
- Configurable photo paths
- Integration with Navigator for team-based navigation

## Example File
See `TeamDirectory.olx` for the basic demo.
