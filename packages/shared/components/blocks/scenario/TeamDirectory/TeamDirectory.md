# TeamDirectory

Interactive team directory showing team members with grid and detail views. Members are defined via the cast system — inline YAML body, `cast=` file, or inherited from a parent `<Cast>` block.

```olx:playground
<TeamDirectory id="team_demo" title="Research Lab">
Dr. Chen:
  seed: chen_professor
  openPeeps:
    face: calm
  profile:
    role: Principal Investigator
    bio: Leads the cognitive science research group.
Maya:
  seed: maya_grad
  openPeeps:
    face: smile
  profile:
    role: Graduate Student
    bio: Studying learning transfer in STEM education.
    skills: [experimental design, statistics, Python]
</TeamDirectory>
```

## Attributes

- `id` (required): Unique identifier
- `title` (optional): Directory heading (defaults to "Team Directory")
- `group` (optional): Filter to cast members belonging to this group
- `cast` (optional): Path to a `.cast` YAML file or inline cast object

## Cast Sources

Members can come from any combination of sources (later wins):

1. **Parent `<Cast>` block** — inherited via runtime
2. **`cast=` attribute** — file reference or inline object
3. **Body YAML** — inline cast definitions (most specific)

```olx:code
<!-- From a .cast file -->
<TeamDirectory id="team" cast="team.cast" group="interns" />

<!-- Inline body YAML -->
<TeamDirectory id="team" title="Our Team">
Kim:
  seed: kim_01
  profile:
    role: Researcher
</TeamDirectory>

<!-- Inherited from parent Cast -->
<Cast cast="characters.cast">
  <TeamDirectory id="team" group="staff" />
</Cast>
```

## Cast Member Fields

Each member supports:

- `name` — Display name (defaults to the member ID)
- `seed` — Avatar generation seed
- `style` — `illustrated` (default), `initials`, or `image`
- `src` — Image path (when style is `image`)
- `openPeeps` — DiceBear avatar options (`face`, `head`, `skinColor`, etc.)
- `profile` — Ad-hoc fields (`role`, `bio`, `skills`, `experience`, etc.)
- `groups` — Array of group tags for filtering with `group=`

## State

- `selectedMember`: Currently selected team member ID
- `viewMode`: `grid` (card overview) or `detail` (full profile)

## Tips

- Use `groups` and `group=` to show subsets of a larger cast
- Profile fields (`role`, `bio`, `skills`) are rendered automatically in detail view
- Combine with `<Cast>` to share characters across TeamDirectory, TalkBubble, and Chat
