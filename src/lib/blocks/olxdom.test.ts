// src/lib/blocks/olxdom.test.js
import { getKidsBFS, getKidsDFS, getParents, inferRelatedNodes, getAllNodes, __testables } from './olxdom';

const { normalizeTargetIds, normalizeInfer} = __testables;

// Minimal mock node tree
// Note: In production, `blueprint` is on nodeInfo, not on nodeInfo.node.
// The `node` property contains the OLX node (id, tag, attributes, kids).
// See render.jsx:107 where nodeInfo is created.
const tree = {
  node: { id: 'A' },
  loBlock: { isAction: true, isGrader: false, isInput: false, isMatch: false },
  renderedKids: {
    B: {
      node: { id: 'B' },
      loBlock: { isAction: false, isGrader: false, isInput: false, isMatch: false },
      renderedKids: {
        D: {
          node: { id: 'D' },
          loBlock: { isAction: true, isGrader: false, isInput: false, isMatch: false },
          renderedKids: {},
          // parent assigned below
        },
      },
      // parent assigned below
    },
    C: {
      node: { id: 'C' },
      loBlock: { isAction: true, isGrader: false, isInput: false, isMatch: false },
      renderedKids: {},
      // parent assigned below
    },
  },
  // no parent on root
};
// Patch up parents for test (only needed for getParents)
tree.renderedKids.B.parent = tree;
tree.renderedKids.C.parent = tree;
tree.renderedKids.B.renderedKids.D.parent = tree.renderedKids.B;

describe('getKidsBFS', () => {
  it('returns all descendants in BFS order, omitting root by default', () => {
    expect(getKidsBFS(tree).map(ni => ni.node.id)).toEqual(['B', 'C', 'D']);
  });

  it('returns all nodes in BFS order, including root when requested', () => {
    expect(getKidsBFS(tree, { includeRoot: true }).map(ni => ni.node.id)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('can filter nodes', () => {
    expect(getKidsBFS(tree, { selector: ni => ni.node.id === 'C' }).map(ni => ni.node.id)).toEqual(['C']);
  });
});

describe('getKidsDFS', () => {
  it('returns all descendants in DFS order, omitting root by default', () => {
    expect(getKidsDFS(tree).map(ni => ni.node.id)).toEqual(['B', 'D', 'C']);
  });

  it('returns all nodes in DFS order, including root when requested', () => {
    expect(getKidsDFS(tree, { includeRoot: true }).map(ni => ni.node.id)).toEqual(['A', 'B', 'D', 'C']);
  });

  it('can filter nodes', () => {
    expect(getKidsDFS(tree, { selector: ni => ni.node.id === 'D' }).map(ni => ni.node.id)).toEqual(['D']);
  });
});

describe('getParents', () => {
  it('returns all parents, omitting self by default', () => {
    expect(getParents(tree.renderedKids.B.renderedKids.D).map(ni => ni.node.id)).toEqual(['B', 'A']);
  });

  it('returns all parents, including self when requested', () => {
    expect(getParents(tree.renderedKids.B.renderedKids.D, { includeRoot: true }).map(ni => ni.node.id))
      .toEqual(['D', 'B', 'A']);
  });

  it('can filter parents', () => {
    expect(getParents(
      tree.renderedKids.B.renderedKids.D,
      { selector: ni => ni.node.id === 'A' }).map(ni => ni.node.id))
      .toEqual(['A']);
  });

  it('returns empty for root node', () => {
    expect(getParents(tree)).toEqual([]);
  });
});

describe('inferRelatedNodes', () => {
  it("normalizeTargetIds basic cases", () => {
    expect(normalizeTargetIds(false)).toEqual(false);
    expect(normalizeTargetIds(undefined)).toEqual(false);
    expect(normalizeTargetIds(null)).toEqual(false);
    expect(() => normalizeTargetIds(true)).toThrow();
    expect(normalizeTargetIds("foo, bar, baz")).toEqual(["foo", "bar", "baz"]);
    expect(normalizeTargetIds("foo")).toEqual(["foo"]);
    expect(normalizeTargetIds(["foo", "bar"])).toEqual(["foo", "bar"]);
    expect(() => normalizeTargetIds(123)).toThrow();
    expect(() => normalizeTargetIds({})).toThrow();
  });
  it("normalizeInfer clean version with validation", () => {
    expect(normalizeInfer(null, ['parents'])).toEqual(['parents']);
    expect(normalizeInfer(undefined, ['parents'])).toEqual(['parents']);
    expect(normalizeInfer(false, ['parents'])).toEqual([]);
    expect(normalizeInfer("false", ['parents'])).toEqual([]);
    expect(normalizeInfer(true, ['parents'])).toEqual(['parents', 'kids']);
    expect(normalizeInfer(" TrUe", ['parents'])).toEqual(['parents', 'kids']);
    expect(normalizeInfer("parents", ['parents'])).toEqual(['parents']);
    expect(normalizeInfer("parents ,  kids", ['parents'])).toEqual(['parents', 'kids']);
    expect(normalizeInfer(["PARENTS", "  kids"], ['parents'])).toEqual(['parents', 'kids']);
    expect(() => normalizeInfer("foo", ['parents'])).toThrow();
    expect(() => normalizeInfer(["parents", "foo"], ['parents'])).toThrow();
  });

  it("returns all parents and kids (default infer=true)", () => {
    const result = inferRelatedNodes(
      { nodeInfo: tree },
      { selector: n => true, infer: true }
    );
    // Expect parents: none (root), kids: B, C, D (all descendants)
    expect(result.sort()).toEqual(['B', 'C', 'D']);
  });

  it("returns only kids when infer='kids'", () => {
    const result = inferRelatedNodes(
      { nodeInfo: tree },
      { selector: n => true, infer: 'kids' }
    );
    expect(result.sort()).toEqual(['B', 'C', 'D']);
  });

  it("returns only parents when infer='parents'", () => {
    const result = inferRelatedNodes(
      { nodeInfo: tree.renderedKids.B.renderedKids.D },
      { selector: n => true, infer: 'parents' }
    );
    // D's parents: B, A
    expect(result.sort()).toEqual(['A', 'B']);
  });

  it("returns empty array when infer is false", () => {
    const result = inferRelatedNodes(
      { nodeInfo: tree },
      { selector: n => true, infer: false }
    );
    expect(result).toEqual([]);
  });

  it("filters by selector", () => {
    // Only nodes with isAction: true (blueprint is on nodeInfo, not nodeInfo.node)
    const result = inferRelatedNodes(
      { nodeInfo: tree },
      { selector: n => n.loBlock.isAction, infer: true }
    );
    expect(result.sort()).toEqual(['C', 'D']);
  });

  it("supports targets as comma-string", () => {
    // When targets is set, inferModes defaults to []
    const result = inferRelatedNodes(
      { nodeInfo: tree },
      { selector: n => true, targets: "B, C" }
    );
    expect(result.sort()).toEqual(['B', 'C']);
  });

  it("throws if no node or selector", () => {
    expect(() => inferRelatedNodes({}, { selector: n => true })).toThrow();
    expect(() => inferRelatedNodes({ nodeInfo: tree }, {})).toThrow();
  });
});

describe('getAllNodes', () => {
  it('returns all nodes from anywhere in the tree', () => {
    // Start from 'D', should still get ['A', 'B', 'D', 'C']
    expect(getAllNodes(tree.renderedKids.B.renderedKids.D).map(ni => ni.node.id))
      .toEqual(['A', 'B', 'D', 'C']);
  });

  it('can filter nodes', () => {
    expect(getAllNodes(tree, { selector: ni => ni.node.id === 'D' }).map(ni => ni.node.id))
      .toEqual(['D']);
  });
});
