# AvatarEditor

This is a toy. It might go away tomorrow.

Specifically, it is a prototype visual editor for designing Open Peeps avatars and exporting cast member YAML into cast-of-character files. It's convenient before we have something final. Pick face, head, accessories, facial hair, mask, and colors from thumbnail grids, fill in profile info, then copy the YAML into a `.cast` file or `<Cast>` body.

Eventually, this ought to fold into an authoring workflow with meaningful cast management, or we ought to build something better, but in the interim, it fills a very necessary gap.

## Tabs

| Tab | What it does |
|-----|-------------|
| Face | 30 expression thumbnails |
| Head | 48 hair/hat style thumbnails |
| Accessories | Glasses, sunglasses, eyepatch |
| Facial Hair | Beards, moustaches, goatees |
| Mask | Medical mask, respirator |
| Colors | Skin, clothing, and hair color swatches + hex input |
| YAML | Profile fields (role, bio, groups) + copyable cast member YAML |

## Workflow

1. Set a **name** and optionally a **seed** (left panel)
2. Pick visual features across the tabs
3. Switch to **YAML** tab, fill in role/bio/groups
4. Copy the YAML into a `.cast` file or inline `<Cast>` / `<TeamDirectory>` body
