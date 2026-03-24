// src/lib/cast.ts
//
// Cast-of-characters library — unified character definitions for avatars,
// team directories, and dialogue systems.
//
// A "cast" is a YAML record mapping character IDs to their definitions.
// Casts propagate through the component tree via runtime.cast (like locale).
// The same character shows a consistent avatar in Chat, TalkBubble,
// TeamDirectory, or any future block that calls useCast().
//
// Example .cast file (YAML):
//
//   ty:
//     name: Ty Johnson
//     seed: ty_intern
//     openPeeps:
//       face: smile
//       head: short1
//       skinColor: d08b5b
//     profile:
//       role: Intern
//       bio: Data analysis enthusiast
//     groups: [interns, comm360]
//
//   lianne:
//     name: Lianne Park
//     src: images/lianne.png
//     profile:
//       role: Supervisor
//     groups: [supervisors, comm360]
//
// Usage in OLX:
//
//   <Cast cast="characters.cast">         ← propthreads cast to children
//     <TalkBubble speaker="ty">...</TalkBubble>
//     <TeamDirectory group="interns"/>
//   </Cast>
//
// Merge order (most specific wins):
//   runtime.cast (from parent <Cast>)
//     ← block's cast= attribute
//       ← block-specific sources (e.g. Chat YAML header)
//
// API:
//   Schemas:   CastSchema, CastMemberSchema, OpenPeepsSchema, Face
//   Internal:  parseCastYaml, mergeCasts, castMemberToAvatarProps
//   Blocks:    useCast, updateCast, withCastSupport
//
// Avatar generation uses DiceBear's Open Peeps style:
//   Playground:   https://www.dicebear.com/playground/?style=open-peeps
//   Options ref:  https://www.dicebear.com/styles/open-peeps/#options
//   Open Peeps:   https://www.openpeeps.com/
//
import { z } from 'zod';
import yaml from 'js-yaml';
import type { LoBlockRuntimeContext } from '@/lib/types';

// =============================================================================
// Zod Schemas
// =============================================================================

// DiceBear Open Peeps enum values.
// Source: @dicebear/open-peeps schema.ts
// Preview: https://www.dicebear.com/playground/?style=open-peeps
// Full options reference: https://www.dicebear.com/styles/open-peeps/#options

export const Face = z.enum([
  'angryWithFang', 'awe', 'blank', 'calm', 'cheeky',
  'concerned', 'concernedFear', 'contempt', 'cute', 'cyclops',
  'driven', 'eatingHappy', 'explaining', 'eyesClosed', 'fear',
  'hectic', 'lovingGrin1', 'lovingGrin2', 'monster', 'old',
  'rage', 'serious', 'smile', 'smileBig', 'smileLOL',
  'smileTeethGap', 'solemn', 'suspicious', 'tired', 'veryAngry',
]);

const Head = z.enum([
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

const Accessories = z.enum([
  'eyepatch', 'glasses', 'glasses2', 'glasses3', 'glasses4',
  'glasses5', 'sunglasses', 'sunglasses2',
]);

const FacialHair = z.enum([
  'chin', 'full', 'full2', 'full3', 'full4',
  'goatee1', 'goatee2', 'moustache1', 'moustache2', 'moustache3',
  'moustache4', 'moustache5', 'moustache6', 'moustache7', 'moustache8',
  'moustache9',
]);

const Mask = z.enum(['medicalMask', 'respirator']);

// Hex color: 6 hex digits (no #), matching DiceBear's pattern
const HexColor = z.string().regex(/^[a-fA-F0-9]{6}$/);

/**
 * DiceBear Open Peeps avatar options.
 * Nested under `openPeeps` in the cast member definition.
 *
 * Enum fields (face, head, etc.) accept a single value or an array
 * (DiceBear picks randomly from arrays). Color fields are 6-digit hex strings.
 */
export const OpenPeepsSchema = z.object({
  face: z.union([Face, z.array(Face)]).optional(),
  head: z.union([Head, z.array(Head)]).optional(),
  accessories: z.union([Accessories, z.array(Accessories)]).optional(),
  facialHair: z.union([FacialHair, z.array(FacialHair)]).optional(),
  mask: z.union([Mask, z.array(Mask)]).optional(),
  skinColor: z.union([HexColor, z.array(HexColor)]).optional(),
  clothingColor: z.union([HexColor, z.array(HexColor)]).optional(),
}).strict();

/**
 * A single cast member definition.
 *
 * Common fields (name, seed, style, src) are strongly validated.
 * openPeeps holds DiceBear options. profile holds ad-hoc course-specific
 * fields (bio, role, skills, etc.). groups controls filtering.
 *
 * All fields are optional because partial overrides (e.g. just changing
 * openPeeps.head for a scene) are valid. Defaults are applied when
 * materializing avatar props via castMemberToAvatarProps().
 */
export const CastMemberSchema = z.object({
  name: z.string().optional(),
  seed: z.string().optional(),
  style: z.enum(['illustrated', 'initials', 'image']).optional(),
  src: z.string().optional(),
  openPeeps: OpenPeepsSchema.optional(),
  profile: z.record(z.unknown()).optional(),
  groups: z.array(z.string()).optional(),
}).strict();

/**
 * Full cast: maps character IDs to their definitions.
 *
 * IDs are free-form strings (e.g. "bob", "Professor Chen").
 * In YAML, they appear as top-level keys.
 */
export const CastSchema = z.record(z.string(), CastMemberSchema);

// Inferred types — single source of truth from Zod schemas above.
// Re-exported via types.ts for the rest of the codebase.
export type OpenPeeps = z.infer<typeof OpenPeepsSchema>;
export type CastMember = z.infer<typeof CastMemberSchema>;
export type Cast = z.infer<typeof CastSchema>;

// =============================================================================
// Internal utilities
// =============================================================================

/**
 * Recursive deep merge for plain objects.
 * Objects merge recursively; arrays and scalars are overwritten.
 */
function deepMerge(
  base: Record<string, any>,
  override: Record<string, any>
): Record<string, any> {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] !== null &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// =============================================================================
// Core functions
// =============================================================================

// Known field names for case-sensitivity suggestions
const CAST_MEMBER_KEYS = Object.keys(CastMemberSchema.shape);
const OPEN_PEEPS_KEYS = Object.keys(OpenPeepsSchema.shape);

/**
 * Find a case-insensitive match in a list of valid keys.
 * Returns the correct key if there's a case mismatch, undefined otherwise.
 */
function findCaseMismatch(key: string, validKeys: string[]): string | undefined {
  const lower = key.toLowerCase();
  return validKeys.find(k => k.toLowerCase() === lower && k !== key);
}

/**
 * Scan raw cast data for case mismatches and return helpful warnings.
 * Called before or after Zod validation to provide "did you mean..." hints.
 */
function scanCaseMismatches(raw: unknown): string[] {
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return warnings;

  for (const [memberId, memberDef] of Object.entries(raw as Record<string, any>)) {
    if (!memberDef || typeof memberDef !== 'object' || Array.isArray(memberDef)) continue;
    for (const key of Object.keys(memberDef)) {
      const match = findCaseMismatch(key, CAST_MEMBER_KEYS);
      if (match) {
        warnings.push(`"${memberId}": "${key}" should be "${match}" (keys are case-sensitive)`);
      }
    }
    // Check nested openPeeps keys too (handle any casing of the key itself)
    const peepsKey = Object.keys(memberDef).find(k => k.toLowerCase() === 'openpeeps');
    const peeps = peepsKey ? memberDef[peepsKey] : undefined;
    if (peeps && typeof peeps === 'object' && !Array.isArray(peeps)) {
      for (const key of Object.keys(peeps)) {
        const match = findCaseMismatch(key, OPEN_PEEPS_KEYS);
        if (match) {
          warnings.push(`"${memberId}".openPeeps: "${key}" should be "${match}" (keys are case-sensitive)`);
        }
      }
    }
  }
  return warnings;
}

/**
 * Validate raw cast data with Zod and return case-sensitivity warnings.
 *
 * On success, returns { cast, warnings }. Warnings are non-fatal (e.g.
 * fields that are valid but unusually cased).
 *
 * On failure, throws with enhanced error messages including "did you mean..."
 * hints for case mismatches.
 */
export function validateCast(raw: unknown): { cast: Cast; warnings: string[] } {
  const caseWarnings = scanCaseMismatches(raw);

  try {
    const cast = CastSchema.parse(raw);
    return { cast, warnings: caseWarnings };
  } catch (e: any) {
    if (caseWarnings.length > 0) {
      throw new Error(`Cast validation failed:\n${caseWarnings.join('\n')}\n\nOriginal error: ${e.message}`);
    }
    throw e;
  }
}

/**
 * Parse a YAML string as a Cast, validating against CastSchema.
 *
 * @throws on invalid YAML or schema violations (with case-sensitivity hints)
 */
export function parseCastYaml(text: string): Cast {
  const raw = yaml.load(text);
  if (!raw || typeof raw !== 'object') return {};
  const { cast } = validateCast(raw);
  return cast;
}

/**
 * Merge multiple casts, left to right. Later casts override earlier ones.
 * Merge is recursive: nested objects (like openPeeps) are deep-merged,
 * so a partial override like `{ bob: { openPeeps: { head: 'turban' } } }`
 * only changes Bob's head, preserving everything else.
 */
export function mergeCasts(
  ...casts: (Cast | undefined | null)[]
): Cast {
  const result: Cast = {};
  for (const cast of casts) {
    if (!cast) continue;
    for (const [id, member] of Object.entries(cast)) {
      if (!result[id]) {
        result[id] = { ...member };
      } else {
        result[id] = deepMerge(result[id], member) as CastMember;
      }
    }
  }
  return result;
}

/**
 * Create a new runtime context with an updated cast.
 */
export function updateRuntimeCast(
  runtime: LoBlockRuntimeContext,
  newCast: Cast
): LoBlockRuntimeContext {
  return { ...runtime, cast: newCast };
}

/**
 * Convert a CastMember to props for the Avatar component.
 *
 * Applies defaults: name defaults to the character ID,
 * seed defaults to the character ID, style is inferred from
 * whether src (image) or openPeeps (illustrated) is present.
 *
 * @param id - The character's cast ID (used as default name/seed)
 * @param member - The cast member definition
 * @returns Props suitable for <Avatar name= seed= style= src= options= />
 */
export function castMemberToAvatarProps(
  id: string,
  member: CastMember
): {
  name: string;
  seed: string;
  style?: 'illustrated' | 'initials';
  src?: string;
  options?: Record<string, any>;
} {
  const name = member.name ?? id;
  const seed = member.seed ?? id;

  // When src is provided, Avatar renders it directly (style is irrelevant)
  if (member.src) {
    return { name, seed, src: member.src, options: member.openPeeps || undefined };
  }

  const style = member.style === 'initials' ? 'initials' : 'illustrated';
  return {
    name,
    seed,
    style,
    options: member.openPeeps || undefined,
  };
}

// =============================================================================
// Blocks API
// =============================================================================

/**
 * Merge the runtime cast with a block's local cast attribute.
 *
 * Usage in components:
 *   const cast = useCast(props);
 *   const avatarProps = castMemberToAvatarProps('bob', cast['bob']);
 */
export function useCast(props: any): Cast {
  return mergeCasts(props.runtime?.cast, props.cast);
}

/**
 * Return new props with the cast propthreaded into the runtime.
 *
 * Used by wrapper blocks (like <Cast>) to pass updated cast to children:
 *   const castProps = updateCast(props, mergedCast);
 *   const { kids } = useKids(castProps);
 */
export function updateCast(
  props: any,
  cast: Cast
): any {
  return {
    ...props,
    runtime: updateRuntimeCast(props.runtime, cast),
  };
}

/**
 * Parser decorator: loads `cast=""` files at parse time.
 *
 * Wraps a parser config (e.g. from parsers.blocks()) so that when the
 * block has a `cast="path/to/file.cast"` attribute, the file is loaded,
 * parsed as YAML, validated against CastSchema, and the attribute is
 * replaced with the parsed Cast object before the inner parser runs.
 *
 * Usage in block definitions:
 *   const MyBlock = core({
 *     ...withCastSupport(parsers.blocks()),
 *     name: 'MyBlock',
 *     attributes: baseAttributes.extend({
 *       cast: z.union([z.string(), CastSchema]).optional(),
 *     }),
 *   });
 */
export function withCastSupport(
  parserConfig: { parser: (...args: any[]) => any; staticKids?: (...args: any[]) => any; [key: string]: any }
): { parser: (...args: any[]) => any; staticKids?: (...args: any[]) => any; [key: string]: any } {
  return {
    ...parserConfig,
    parser: async function withCastParser(ctx: any) {
      if (ctx.attributes?.cast && typeof ctx.attributes.cast === 'string') {
        if (!ctx.provider) {
          throw new Error('withCastSupport: no storage provider for resolving cast file');
        }
        const castPath = ctx.attributes.cast;
        const lastProv = ctx.provenance?.[ctx.provenance.length - 1];
        let resolved, castProvenance, content;
        try {
          resolved = ctx.provider.resolveRelativePath(lastProv, castPath);
          castProvenance = ctx.provider.toProvenanceURI(resolved);
          ({ content } = await ctx.provider.read(resolved));
        } catch (e: any) {
          throw new Error(`Cast file not found: "${castPath}" (resolved from ${lastProv})\n${e.message}`);
        }
        const parsedCast = parseCastYaml(content);

        // Resolve member src paths relative to the cast file's location,
        // so images like "images/anne.png" become content-relative paths
        // (e.g. "sba/interdisciplinary/images/anne.png") that resolveContentPath
        // can map to a serveable URL at render time.
        for (const [id, member] of Object.entries(parsedCast)) {
          if (member.src && !member.src.startsWith('http://') && !member.src.startsWith('https://') && !member.src.startsWith('//') && !member.src.startsWith('/')) {
            parsedCast[id] = { ...member, src: ctx.provider.resolveRelativePath(castProvenance, member.src) };
          }
        }

        ctx = {
          ...ctx,
          attributes: { ...ctx.attributes, cast: parsedCast },
        };
      }
      return parserConfig.parser(ctx);
    },
  };
}
