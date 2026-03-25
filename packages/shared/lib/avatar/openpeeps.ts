// src/lib/openpeeps.ts
//
// Zod schemas and TypeScript types for the cast-of-characters system.
//
// This file defines the data model — no runtime code, no side effects.
// Runtime functions (parsing, merging, propthreading) live in cast.ts.
//
// Three layers:
//
//   1. DiceBear Open Peeps — enum values for avatar generation
//      (face expressions, hairstyles, accessories, etc.)
//
//   2. Cast member — a single character definition
//      (name, avatar seed, image src, openPeeps options, profile metadata)
//
//   3. Cast — a record mapping character IDs to their definitions
//      (the top-level structure of a .cast YAML file)
//
// For avatar customization options, see:
//   Playground:   https://www.dicebear.com/playground/?style=open-peeps
//   Options ref:  https://www.dicebear.com/styles/open-peeps/#options
//   Open Peeps:   https://www.openpeeps.com/
//
import { z } from 'zod';

// =============================================================================
// DiceBear Open Peeps
// =============================================================================
//
// Enum values sourced from @dicebear/open-peeps schema.ts.
// Each field accepts a single value or an array (DiceBear picks randomly).

export const Face = z.enum([
  'angryWithFang', 'awe', 'blank', 'calm', 'cheeky',
  'concerned', 'concernedFear', 'contempt', 'cute', 'cyclops',
  'driven', 'eatingHappy', 'explaining', 'eyesClosed', 'fear',
  'hectic', 'lovingGrin1', 'lovingGrin2', 'monster', 'old',
  'rage', 'serious', 'smile', 'smileBig', 'smileLOL',
  'smileTeethGap', 'solemn', 'suspicious', 'tired', 'veryAngry',
]);

export const Head = z.enum([
  'afro', 'bangs', 'bangs2', 'bantuKnots', 'bear',
  'bun', 'bun2', 'buns', 'cornrows', 'cornrows2',
  'dreads1', 'dreads2', 'flatTop', 'flatTopLong', 'grayBun',
  'grayMedium', 'grayShort', 'hatBeanie', 'hatHip', 'hijab',
  'long', 'longAfro', 'longBangs', 'longCurly', 'medium1',
  'medium2', 'medium3', 'mediumBangs', 'mediumBangs2', 'mediumBangs3',
  'mediumStraight', 'mohawk', 'mohawk2', 'noHair1', 'noHair2',
  'noHair3', 'pomp', 'shaved1', 'shaved2', 'shaved3',
  'short1', 'short2', 'short3', 'short4', 'short5',
  'turban', 'twists', 'twists2',
]);

export const Accessories = z.enum([
  'eyepatch', 'glasses', 'glasses2', 'glasses3', 'glasses4',
  'glasses5', 'sunglasses', 'sunglasses2',
]);

export const FacialHair = z.enum([
  'chin', 'full', 'full2', 'full3', 'full4',
  'goatee1', 'goatee2', 'moustache1', 'moustache2', 'moustache3',
  'moustache4', 'moustache5', 'moustache6', 'moustache7', 'moustache8',
  'moustache9',
]);

export const Mask = z.enum(['medicalMask', 'respirator']);

// Hex color: 6 hex digits (no #), matching DiceBear's pattern.
const HexColor = z.string().regex(/^[a-fA-F0-9]{6}$/);

/**
 * DiceBear Open Peeps avatar options.
 *
 * Nested under `openPeeps` in cast member definitions.
 * Enum fields accept a single value or an array (DiceBear picks randomly
 * from arrays). Color fields are 6-digit hex strings.
 */
export const OpenPeepsSchema = z.object({
  face: z.union([Face, z.array(Face)]).optional(),
  head: z.union([Head, z.array(Head)]).optional(),
  accessories: z.union([Accessories, z.array(Accessories)]).optional(),
  facialHair: z.union([FacialHair, z.array(FacialHair)]).optional(),
  mask: z.union([Mask, z.array(Mask)]).optional(),
  skinColor: z.union([HexColor, z.array(HexColor)]).optional(),
  clothingColor: z.union([HexColor, z.array(HexColor)]).optional(),
  headContrastColor: z.union([HexColor, z.array(HexColor)]).optional(),
}).strict();

// =============================================================================
// Cast member
// =============================================================================

/** Avatar rendering style. */
export const AvatarStyle = z.enum(['illustrated', 'initials', 'image']);

/**
 * A single cast member definition.
 *
 * Common fields (name, seed, style, src) are strongly validated.
 * `openPeeps` holds DiceBear options. `profile` holds ad-hoc
 * course-specific fields (bio, role, skills, etc.). `groups`
 * controls filtering (e.g. TeamDirectory group= attribute).
 *
 * All fields are optional — partial overrides (e.g. just changing
 * openPeeps.head for a scene) are valid. Defaults are applied when
 * materializing avatar props via castMemberToAvatarProps().
 */
export const CastMemberSchema = z.object({
  name: z.string().optional(),
  seed: z.string().optional(),
  style: AvatarStyle.optional(),
  src: z.string().optional(),
  openPeeps: OpenPeepsSchema.optional(),
  profile: z.record(z.unknown()).optional(),
  groups: z.array(z.string()).optional(),
}).strict();

// =============================================================================
// Cast
// =============================================================================

/**
 * Full cast: maps character IDs to their definitions.
 *
 * IDs are free-form strings (e.g. "bob", "Professor Chen").
 * In YAML, they appear as top-level keys.
 */
export const CastSchema = z.record(z.string(), CastMemberSchema);

// =============================================================================
// Inferred types
// =============================================================================
//
// Single source of truth from the Zod schemas above.
// Re-exported via types.ts for the rest of the codebase.

export type FaceExpression = z.infer<typeof Face>;
export type AvatarStyleValue = z.infer<typeof AvatarStyle>;
export type OpenPeeps = z.infer<typeof OpenPeepsSchema>;
export type CastMember = z.infer<typeof CastMemberSchema>;
export type Cast = z.infer<typeof CastSchema>;
