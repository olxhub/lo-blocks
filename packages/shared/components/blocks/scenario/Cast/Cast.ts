// src/components/blocks/layout/Cast/Cast.ts
//
// Cast block — transparent wrapper that propthreads a cast-of-characters
// to its children via runtime.cast.
//
// Usage:
//   <Cast cast="characters.cast">
//     <TalkBubble speaker="bob">...</TalkBubble>
//     <TeamDirectory/>
//   </Cast>
//
// The cast= attribute points to a YAML file. withCastSupport loads and
// parses it at parse time; the component propthreads the result.
//
// Future: inline cast definitions (YAML inside the tag body) could be
// supported via a <Characters> pseudo-element or similar mechanism.
//
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { cast } from '@/lib/blocks/attributeSchemas';
import { withCastSupport } from '@/lib/avatar/cast';
import _Cast from './_Cast';

const Cast = core({
  ...withCastSupport(parsers.blocks()),
  name: 'Cast',
  description: 'Defines a cast of characters available to child components',
  component: _Cast,
  attributes: z.object({ ...cast }).strict(),

});

export default Cast;
