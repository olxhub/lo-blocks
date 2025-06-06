import { getChildrenBFS, getChildrenDFS, getParents, inferRelatedNodes, getAllNodes, __testables } from './olxdom';

const { normalizeTargetIds, normalizeInfer} = __testables;

// Minimal mock node tree
const tree = {
  node: { id: 'A', spec: {isAction: true} },
  renderedChildren: {
    B: {
      node: { id: 'B' },
      renderedChildren: {
        D: {
          node: { id: 'D', spec: {isAction: true} },
          renderedChildren: {},
          // parent assigned below
        },
      },
      // parent assigned below
    },
    C: {
      node: { id: 'C', spec: {isAction: true} },
      renderedChildren: {},
      // parent assigned below
    },
  },
  // no parent on root
};
// Patch up parents for test (only needed for getParents)
tree.renderedChildren.B.parent = tree;
tree.renderedChildren.C.parent = tree;
tree.renderedChildren.B.renderedChildren.D.parent = tree.renderedChildren.B;

describe('getChildrenBFS', () => {
  it('returns all descendants in BFS order, omitting root by default', () => {
    expect(getChildrenBFS(tree).map(ni => ni.node.id)).toEqual(['B', 'C', 'D']);
  });

  it('returns all nodes in BFS order, including root when requested', () => {
    expect(getChildrenBFS(tree, { includeRoot: true }).map(ni => ni.node.id)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('can filter nodes', () => {
    expect(getChildrenBFS(tree, { selector: ni => ni.node.id === 'C' }).map(ni => ni.node.id)).toEqual(['C']);
  });
});

describe('getChildrenDFS', () => {
  it('returns all descendants in DFS order, omitting root by default', () => {
    expect(getChildrenDFS(tree).map(ni => ni.node.id)).toEqual(['B', 'D', 'C']);
  });

  it('returns all nodes in DFS order, including root when requested', () => {
    expect(getChildrenDFS(tree, { includeRoot: true }).map(ni => ni.node.id)).toEqual(['A', 'B', 'D', 'C']);
  });

  it('can filter nodes', () => {
    expect(getChildrenDFS(tree, { selector: ni => ni.node.id === 'D' }).map(ni => ni.node.id)).toEqual(['D']);
  });
});

describe('getParents', () => {
  it('returns all parents, omitting self by default', () => {  
    expect(getParents(tree.renderedChildren.B.renderedChildren.D).map(ni => ni.node.id)).toEqual(['B', 'A']);
  });

  it('returns all parents, including self when requested', () => {
    expect(getParents(tree.renderedChildren.B.renderedChildren.D, { includeRoot: true }).map(ni => ni.node.id))
      .toEqual(['D', 'B', 'A']);
  });

  it('can filter parents', () => {
    expect(getParents(
      tree.renderedChildren.B.renderedChildren.D,
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
    expect(normalizeInfer(true, ['parents'])).toEqual(['parents', 'children']);
    expect(normalizeInfer(" TrUe", ['parents'])).toEqual(['parents', 'children']);
    expect(normalizeInfer("parents", ['parents'])).toEqual(['parents']);
    expect(normalizeInfer("parents ,  children", ['parents'])).toEqual(['parents', 'children']);
    expect(normalizeInfer(["PARENTS", "  children"], ['parents'])).toEqual(['parents', 'children']);
    expect(() => normalizeInfer("foo", ['parents'])).toThrow();
    expect(() => normalizeInfer(["parents", "foo"], ['parents'])).toThrow();
  });

  it("returns all parents and children (default infer=true)", () => {
    const result = inferRelatedNodes(
      { nodeInfo: tree },
      { selector: n => true, infer: true }
    );
    // Expect parents: none (root), children: B, C, D (all descendants)
    expect(result.sort()).toEqual(['B', 'C', 'D']);
  });

  it("returns only children when infer='children'", () => {
    const result = inferRelatedNodes(
      { nodeInfo: tree },
      { selector: n => true, infer: 'children' }
    );
    expect(result.sort()).toEqual(['B', 'C', 'D']);
  });

  it("returns only parents when infer='parents'", () => {
    const result = inferRelatedNodes(
      { nodeInfo: tree.renderedChildren.B.renderedChildren.D },
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
    // Only nodes with isAction: true
    const result = inferRelatedNodes(
      { nodeInfo: tree },
      { selector: n => n.node.spec && n.node.spec.isAction, infer: true }
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
    expect(getAllNodes(tree.renderedChildren.B.renderedChildren.D).map(ni => ni.node.id))
      .toEqual(['A', 'B', 'D', 'C']);
  });

  it('can filter nodes', () => {
    expect(getAllNodes(tree, { selector: ni => ni.node.id === 'D' }).map(ni => ni.node.id))
      .toEqual(['D']);
  });
});
