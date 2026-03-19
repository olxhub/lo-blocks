# PEGDevBlock

## Overview

PEGDevBlock is a development workbench for creating and testing PEG (Parsing Expression Grammar) grammars. It displays the parsed output of content run through `demo.pegjs`, allowing rapid iteration on grammar development.

## Workflow

1. Edit `demo.pegjs` with your grammar
2. Run `npm run build:grammars` to compile
3. Load content using `<PEGDevBlock src="yourfile.demopeg" />`
4. View the parsed JSON output to verify the grammar works correctly
5. Once satisfied, copy the grammar to your new block

## Files

- `demo.pegjs` - The PEG grammar (edit this)
- `_demoParser.js` - Compiled parser (generated, do not edit)
- `_PEGDevBlock.jsx` - Renders parsed output as JSON

## Creating a New PEG-Based Block

Use this block as a template:

1. Duplicate the PEGDevBlock directory
2. Rename files to match your block name
3. Edit the `.pegjs` grammar for your format
4. Update the component to render your parsed structure
5. Register in the block system

## Related Blocks

- **Chat** - Uses `.chatpeg` format
- **TextHighlight** - Uses `.textHighlight` format
- **SimpleSortable** - Uses `.sortpeg` format
