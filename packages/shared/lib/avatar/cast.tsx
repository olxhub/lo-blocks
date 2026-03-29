// src/lib/cast.ts
//
// Cast-of-characters runtime library — parsing, validation, merging,
// and propthreading for the cast system.
//
// Schemas and types live in types.ts (pure data model, no runtime code).
// This file provides the functions that operate on those types.
//
// Usage in OLX:
//
//   <Cast cast="characters.cast">
//     <TalkBubble who="ty">...</TalkBubble>
//     <TeamDirectory group="interns"/>
//   </Cast>
//
// Merge order (most specific wins):
//   runtime.cast (from parent <Cast>)
//     ← block's cast= attribute
//       ← block-specific sources (e.g. Chat YAML header)
//
// API:
//   Runtime:   parseCastYaml, validateCast, mergeCasts, castMemberToAvatarProps
//   Blocks:    useCast, updateCast, avatar, withCastSupport
//
import React from 'react';
import yaml from 'js-yaml';
import type { LoBlockRuntimeContext } from '@/lib/types';
import Avatar from '@/components/common/Avatar';
import {
  CastSchema, CastMemberSchema, OpenPeepsSchema,
  type Cast, type CastMember, type OpenPeeps, type FaceExpression, type AvatarStyleValue,
} from '@/lib/avatar/types';

// Re-export schemas and types so existing imports from '@/lib/cast' still work.
export {
  Face, AvatarStyle,
  OpenPeepsSchema, CastMemberSchema, CastSchema,
  type FaceExpression, type AvatarStyleValue,
  type OpenPeeps, type CastMember, type Cast,
} from '@/lib/avatar/types';

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
export const OPEN_PEEPS_KEYS = Object.keys(OpenPeepsSchema.shape);
export const COLOR_PEEPS_KEYS = ['skinColor', 'clothingColor', 'headContrastColor'];

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
  // Coerce null members to {} so bare YAML keys (e.g. "Jordan:") work.
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const coerced: Record<string, any> = {};
    for (const [key, value] of Object.entries(raw as Record<string, any>)) {
      coerced[key] = value ?? {};
    }
    raw = coerced;
  }

  const caseWarnings = scanCaseMismatches(raw);

  try {
    const cast = CastSchema.parse(raw);

    // Cross-field validation
    for (const [id, member] of Object.entries(cast)) {
      if (member.style === 'image' && !member.src) {
        throw new Error(`"${id}": style is 'image' but no src provided`);
      }
      if (member.src && member.style && member.style !== 'image') {
        throw new Error(`"${id}": has src but style is '${member.style}' (should be 'image' or omitted)`);
      }
      if (member.style === 'emoji' && !member.emoji) {
        throw new Error(`"${id}": style is 'emoji' but no emoji provided`);
      }
    }

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
function updateRuntimeCast(
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
export interface AvatarBaseProps {
  name: string;
  seed: string;
  style?: 'illustrated' | 'initials' | 'emoji' | 'image';
  src?: string;
  emoji?: string;
  options?: OpenPeeps;
}

export function castMemberToAvatarProps(
  id: string,
  member: CastMember
): AvatarBaseProps {
  const name = member.name ?? id;
  const seed = member.seed ?? id;

  // Explicit style takes precedence when present
  if (member.style === 'emoji') {
    return { name, seed, style: 'emoji', emoji: member.emoji };
  }
  if (member.style === 'image') {
    return { name, seed, src: member.src };
  }
  if (member.style === 'initials') {
    return { name, seed, style: 'initials' };
  }

  // No explicit style — infer from available data
  if (member.src) {
    return { name, seed, src: member.src };
  }
  if (member.emoji) {
    return { name, seed, style: 'emoji', emoji: member.emoji };
  }

  return {
    name,
    seed,
    style: 'illustrated',
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
 *   // Then use avatar(props) or look up members directly.
 */
export function useCast(props: any): Cast {
  return mergeCasts(props.runtime?.cast, props.cast);
}

/**
 * Return new props with the merged cast available to children.
 *
 * Used by wrapper blocks (like <Cast>):
 *   const { kids } = useKids(updateCast(props));
 */
export function updateCast(props: any): any {
  const cast = mergeCasts(props.runtime?.cast, props.cast);
  return {
    ...props,
    runtime: updateRuntimeCast(props.runtime, cast),
  };
}

// =============================================================================
// Avatar rendering
// =============================================================================

export interface AvatarOptions {
  who?: string;
  cast?: Cast;
  face?: FaceExpression;
  seed?: string;
  src?: string;
  style?: AvatarStyleValue;
  size?: number;
}

export interface AvatarResult {
  avatar: React.ReactNode;
  name: string;
}

/**
 * Resolve a character from the cast and return a rendered avatar.
 *
 * Reads `who`, `face`, `seed`, `avatar`, `avatarStyle` from props
 * (the `character` mixin fields), with explicit overrides taking precedence.
 * Falls back gracefully when no cast or character is defined.
 *
 * Usage:
 *   import * as cast from '@/lib/avatar/cast';
 *   const { avatar, name } = cast.avatar(props, { size: 48 });
 */
export function avatar(props: any, options?: AvatarOptions): AvatarResult {
  const resolvedCast = options?.cast ?? useCast(props);
  const who = options?.who ?? props.who;
  const face = options?.face ?? props.face;
  const seed = options?.seed ?? props.seed;
  const src = options?.src ?? props.avatar;
  const style = options?.style ?? props.avatarStyle;
  const size = options?.size ?? 32;

  // Defaults from cast member (if found), then overrides from props/options
  const base: AvatarBaseProps = who && resolvedCast[who]
    ? castMemberToAvatarProps(who, resolvedCast[who])
    : { name: who ?? '', seed: who, style: 'illustrated' as const };

  const avatarProps = {
    name: base.name,
    seed: seed ?? base.seed,
    style: style ?? base.style,
    src: src ?? base.src,
    emoji: base.emoji,
    options: face
      ? { ...(base.options || {}), face }
      : base.options,
  };

  return {
    avatar: <Avatar {...avatarProps} size={size} />,
    name: base.name,
  };
}

// =============================================================================
// Parser support
// =============================================================================

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
