// @vitest-environment node
// src/lib/blocks/factory.test.ts
//
// Tests for the block factory's mixin composition. The factory accepts
// `parserMixin`, `inputMixin`, and `graderMixin` keys and composes them
// with the blueprint in order: parser → input → grader → blueprint.
//
// Most keys override (later wins). `fields` and `attributes` accumulate
// and raise on duplicates. `locals` merges per-key.
import { z } from 'zod';
import { test as testBlocks } from './namespaces';
import * as state from '@/lib/state';

describe('factory mixin composition', () => {
  it('smoke: a blueprint without mixin keys still produces a working block', () => {
    const block = testBlocks({
      name: 'PlainBlock',
      description: 'no mixins',
    });
    expect(block.name).toBe('PlainBlock');
    expect(block.description).toBe('no mixins');
  });

  it('parserMixin contributes parser and staticKids to the block', () => {
    const parser = async () => 'parsed';
    const staticKids = () => [];
    const block = testBlocks({
      parserMixin: { parser, staticKids },
      name: 'ParserMixinBlock',
    });
    expect(block.parser).toBe(parser);
    expect(block.staticKids).toBe(staticKids);
  });

  it('fields accumulate across an inputMixin and the blueprint', () => {
    const block = testBlocks({
      inputMixin: { fields: state.fields(['mixedIn']) },
      name: 'AccumFieldsBlock',
      fields: state.fields(['fromBlueprint']),
    });
    expect(block.fields.mixedIn).toBeDefined();
    expect(block.fields.fromBlueprint).toBeDefined();
    // The merged Fields should still have a working extend()
    expect(typeof block.fields.extend).toBe('function');
  });

  it('attributes accumulate across an inputMixin and the blueprint', () => {
    const block = testBlocks({
      inputMixin: {
        attributes: z.object({ fromMixin: z.string().optional() }).strict(),
      },
      name: 'AccumAttrsBlock',
      attributes: z.object({ fromBlueprint: z.string().optional() }).strict(),
    });
    const shape = (block.attributes as z.ZodObject<any>).shape;
    expect(shape.fromMixin).toBeDefined();
    expect(shape.fromBlueprint).toBeDefined();
  });

  it('locals merge per-key, later layer wins for the same key', () => {
    const mixinFn = () => 'from mixin';
    const blueprintFn = () => 'from blueprint';
    const onlyInMixin = () => 'only mixin';
    const block = testBlocks({
      inputMixin: { locals: { shared: mixinFn, onlyInMixin } },
      name: 'LocalsMergeBlock',
      locals: { shared: blueprintFn },
    });
    expect(block.locals.shared).toBe(blueprintFn);
    expect(block.locals.onlyInMixin).toBe(onlyInMixin);
  });

  it('raises on duplicate field name with a friendly forward-looking message', () => {
    expect(() =>
      testBlocks({
        inputMixin: { fields: state.fields(['shared']) },
        name: 'DupFieldBlock',
        fields: state.fields(['shared']),
      })
    ).toThrow(/DupFieldBlock.*Field `shared`.*inputMixin.*blueprint.*allowOverrides/s);
  });

  it('raises on duplicate attribute key with a friendly forward-looking message', () => {
    // Note: this test passes a `graderMixin` layer directly on the config,
    // NOT via `createGrader()`. The factory performs no automatic
    // `isGrader`-driven attribute extension — the real `graderAttributes`
    // only get applied when a block spreads the return value of
    // `createGrader()`. This test is exercising the composition layer's
    // duplicate detection, not grader auto-wiring.
    expect(() =>
      testBlocks({
        graderMixin: {
          attributes: z.object({ target: z.string().optional() }).strict(),
        },
        name: 'DupAttrBlock',
        attributes: z.object({ target: z.string().optional() }).strict(),
      })
    ).toThrow(/DupAttrBlock.*Attribute `target`.*graderMixin.*blueprint.*allowOverrides/s);
  });

  it('blueprint wins for scalar keys when every layer sets the same one', () => {
    const block = testBlocks({
      parserMixin: { description: 'from parser' },
      inputMixin: { description: 'from input' },
      graderMixin: { description: 'from grader' },
      name: 'OverrideOrderBlock',
      description: 'from blueprint',
    });
    expect(block.description).toBe('from blueprint');
  });

  // === allowOverrides ===

  it('allowOverrides on the blueprint silently replaces a colliding attribute from a mixin', () => {
    const block = testBlocks({
      graderMixin: {
        attributes: z.object({ target: z.string().optional() }).strict(),
      },
      name: 'AllowAttrOverrideBlock',
      allowOverrides: ['target'],
      attributes: z.object({ target: z.string() }).strict(),
    });
    const shape = (block.attributes as z.ZodObject<any>).shape;
    // Blueprint's required `target` wins over the mixin's optional one.
    expect(shape.target.isOptional()).toBe(false);
  });

  it('allowOverrides on the blueprint silently replaces a colliding field from a mixin', () => {
    const block = testBlocks({
      inputMixin: { fields: state.fields(['shared']) },
      name: 'AllowFieldOverrideBlock',
      allowOverrides: ['shared'],
      fields: state.fields(['shared', 'other']),
    });
    expect(block.fields.shared).toBeDefined();
    expect(block.fields.other).toBeDefined();
  });

  it('allowOverrides naming a different key still raises on the actual collision', () => {
    expect(() =>
      testBlocks({
        graderMixin: {
          attributes: z.object({ target: z.string().optional() }).strict(),
        },
        name: 'AllowWrongKeyBlock',
        allowOverrides: ['something-else'],
        attributes: z.object({ target: z.string() }).strict(),
      })
    ).toThrow(/AllowWrongKeyBlock.*Attribute `target`.*graderMixin.*blueprint/s);
  });

  it('allowOverrides on a blueprint with no mixins is stripped before schema validation', () => {
    // No mixins → no compose path → we still need allowOverrides stripped
    // so strict Zod validation does not reject it as an unknown key.
    const block = testBlocks({
      name: 'AllowOverridesNoMixinBlock',
      allowOverrides: ['unused'],
      description: 'still works',
    });
    expect(block.name).toBe('AllowOverridesNoMixinBlock');
    expect(block.description).toBe('still works');
  });
});
