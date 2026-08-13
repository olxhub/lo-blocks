Learning Observer Blocks -- Design Documentation
================================================

This is design documentation for both humans and LLMs.

# Using the system

Scripts are in `package.json`. Every operation should be done with `npm run` rather than directly.

Ports:

```
  ┌────────┬─────────────────┬────────────────────────────────────────────────────────────────────────┐
  │ Port   │     Service     │                                 Notes                                  │
  ├────────┼─────────────────┼────────────────────────────────────────────────────────────────────────┤
  │ 80/443 │ nginx (prod)    │ nginx config (outside repo)                                            │
  ├────────┼─────────────────┼────────────────────────────────────────────────────────────────────────┤
  │ 8810   │ nginx (dev)     │ nginx config (outside repo)                                            │
  ├────────┼─────────────────┼────────────────────────────────────────────────────────────────────────┤
  │ 8888   │ App server      │ Master entry point. Vite dev middleware, API routes, WS               │
  ├────────┼─────────────────┼────────────────────────────────────────────────────────────────────────┤
  │ 5173   │ Vite static dev │ Vite's default. Only used for standalone static dev, rarely needed     │
  └────────┴─────────────────┴────────────────────────────────────────────────────────────────────────┘
```

# Blocks

Learning Observer blocks are similar to Open edX XBlocks and React components: each block defines an XML tag, which can then be used in courseware.

## Block lifespan and flow

We will walk through the lifespan of a typical block. The most confusing parts the different types of IDs a block might have, and data types at various stages of the block's lifespan. The pathway is

```
           BlockBlueprint  What a developer writes)
                 ↓
              LoBlock      Compiled / validated / cleaned up by the system)
                 ↓
   OLX →      OlxJson     Static content (**instance** of a LoBlock)
                 ↓
             OlxDomNode    Dynamic content (close to 1:1 to static content, but not always, with components like <DynamicList> and other forms of reuse / rewriting)
                 ↓
          Rendered Block   React component (close to 1:1 to dynamic content, but not always; react shadow DOM is a tree, OLX shadow DOM is a DAG)
```

### `BlockBlueprint`

A block is defined with a **block blueprint**. A minimal example is:

```
import * as parsers from '@/lib/content/parsers';
import { dev } from '@/lib/blocks'; // adjust import path as needed
import _Spinner from './_Spinner';

const Spinner = dev({    // Functions to register in different namespaces (e.g. dev, test, core; you'll want your own)
  ...parsers.ignore(),   // How should OLX be parsed?
  name: 'Spinner',       // What am I called?
  component: _Spinner,   // Where is my react component?
});

export default Spinner;
```

This should **not** include `JSX`, as we would like blueprints usable in both server-side and client-side code. By convention, the blueprint is in `BLOCKNAME.[js/ts]`, and the React component in `_BLOCKNAME.[jsx/tsx]`

Running `npm run build` (or, more narrowly, `npm run-script build:gen-block-registry`) collects all block blueprints into `packages/shared/components/blockRegistry.ts`. At this point, we can use the blocks in courseware.

NOTE: Once we're more dynamic, we will want to do this dynamically. The static build is bridge code.

A typical example has quite a bit more:

```
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes, placeholder } from '@/lib/blocks/attributeSchemas';
import _LineInput from './_LineInput';

// Use commonFields for standard fields like 'value', 'correct', 'showAnswer'
// Use string names for block-specific fields: state.fields(['myCustomField'])
export const fields = state.fields([commonFields.value]);

const LineInput = core({
  ...parsers.blocks(),                                                 // Parser so line label can be any OLX block
  ...input(),                                                          // Advertise as input for graders
  name: 'LineInput',
  description: 'Single-line text input field for student responses',   // For documentation
  component: _LineInput,
  fields,                                                              // Where we store our state in redux
  selectValue: (props, state, id) =>                                   // What data we send to a grader
    fieldSelector(state, { ...props, id }, fields.value, { fallback: '' }),
  attributes: baseAttributes.extend({                                  // Validation for our attributes
    ...placeholder,
    type: z.enum(['text', 'number', 'email']).optional().describe('HTML input type'),
  }),
});
```
As well as associated documentation files

**Note**: `core` / `dev` / `test` are defined in `packages/shared/lib/blocks/namespaces.ts` as `lib.blocks.factory.blocks('org.mitros.core')`. We expect institutions to create their own blocks, namespaces, and to avoid conflicts, to eventually implement the possibility to use fully-referenced names (`<edu.mit.Video>` versus `<edu.cmu.Video>`, with `<Video>` defaulting to the local one, and even `xmlns` support). But that's overkill for now.

We'll walk through this piece-by-piece.

### Documentation files

Alongside a block (like `LineInput.js`), we can include several documentation files:

* A `LineInput.md` file should describe the block. We can embed live-editable OLX examples with code blocks of type `olx:playground` (as well as players or just code)
* A **minimal** example, `LineInput.olx`, which should show **as many features as possible, as concisely as possible**. Editors can use this as a template.
* More examples, with a prefix of the name of the block (e.g. `LineInputGraded.olx`) which might show how to use the block in different contexts, more advanced features, creative uses, etc.

All of the examples are also rendered as part of the test / validation suite!

In the future, we may consider an explicit template (`LineInput.template.olx`) to override using the base example as a template in the editor. This is helpful mostly for blocks which can't be used in isolation (e.g. `<Key>` and `<Distractor>` need to be in the context of an MCQ).

### Parser

Parsers define how to transform OLX content into the internal representation. You can write your own, but we provide a library of parsers which suffice for most use-cases:

| Parser                                       | Usage                         | Description                                     |
|----------------------------------------------|-------------------------------|-------------------------------------------------|
| parsers.ignore()                             | ...parsers.ignore()           | No children. For leaf blocks like <Spinner/>.   |
| parsers.blocks()                             | ...parsers.blocks()           | Children are blocks. Filters out text/comments. |
| parsers.blocks.allowHTML()                   | ...parsers.blocks.allowHTML() | Mixed content: blocks + HTML tags + text.       |
| parsers.text()                               | ...parsers.text()             | Text content only. No nested XML allowed.       |
| parsers.text.stripIndent()                   | ...parsers.text.stripIndent() | Strips leading indentation from multiline text. |
| parsers.text.raw()                           | ...parsers.text.raw()         | Preserves all whitespace.                       |
| parsers.xmljson()                            | ...parsers.xmljson()          | Pass through raw parsed XML structure.          |
| parsers.xml                                  | parser: parsers.xml.parser    | Reconstructs XML as a string.                   |
| parsers.assetSrc()                           | ...parsers.assetSrc()         | Resolves `src` attr via provider. No children. (HACK) |
| parsers.peggyParser(grammar)                 | ...parsers.peggyParser(cp)    | Parse with a PEG grammar (see below).           |

For major, reusable blocks, it is reasonable (and not hard) to define your own XML grammar. If you do craft your own parser, **clean error messages are key**.

#### peggyParser

One of the parsers worth highlighting is peggyParser. One of the most loved features in Open edX were simplified authoring markups. Experienced authors **much** preferred this to GUIs. It was very rapid (like authoring markdown). For example, a basic multiple choice question could be written as:

```
Cognitive Load Theory
===

A student is learning to solve quadratic equations while simultaneously trying to remember the quadratic formula. According to cognitive load theory, this represents:

( ) Germane load - it's helping build schemas
(x) Extraneous load - it could be eliminated with a formula sheet
( ) Intrinsic load - it's inherent to the task
( ) There is no cognitive load issue here
```
The Open edX formats were ad-hoc. In Learning Observer blocks, these are formally defined with a PEG grammar. This:
* Allows LLMs to author content easily
* The system to validate block markup, both at load time and in the editor

In most cases, we recommend using the `src=` attribute (valid markup is often invalid XML), but these can be in-lined, optionally using XML `CDATA`. The flow is:
* Define a `.pegjs` grammar (e.g. `chat.pegjs`).
* This is compiled into a parser (e.g. `_chatParser.js`) by the build system.
* The parser generates the `kids` attribute for your component.

#### `kids`

The output of the parser comes into a block through the `react` attribute `kids`. This is similar to react `children`, but:
* Supports free-form formats (e.g. from the `PEG` or text parser)
* Is not rendered `react` (we want to support e.g. lazy loading)

This can be annoying for some types of introspection. Blocks can define a method `staticKids` to allow introspection of children known at OLX parse time. Note that many children are dynamic, so a **static OLX tree is rarely the same as the dynamic OLX DOM**. Adaptive learning blocks like `MasteryBank` can pull in content as they see fit!

#### `zod` Attribute Validation

In addition to internal `xml`, OLX has attributes. For our aforementioned `LineInput` block, we might have `<LineInput placeholder="Enter your name" id="name-entry"\>` (and so on). This can be validated through `zod`:

```
attributes: baseAttributes.extend({                                                  // id=, title=, etc.
  ...placeholder,                                                                    // mix-in for allowing placeholder=
  type: z.enum(['text', 'number', 'email']).optional().describe('HTML input type'),  // Our own attributes
})
```
This is, again, used to validate OLX, both in the editor and at load time. The description becomes part of the auto-generated documentation.

#### `locals` / (Block-specific API)

`locals` allow us to expose block logic for use internally, by graders, or other blocks:

```
const ChoiceInput = core({
  // ...
  locals: {
    getChoices: (props, state, id) => {
      // Return list of Key/Distractor children with metadata
      return [{ id: 'key1', tag: 'Key', value: 'A' }, ...];
    }
  }
});
```

`locals` is relatively new. Our goal is to:
* Move as much of the block logic into locals
* Keep the `react` component, as much as possible, limited to rendering

This serves several goals:
* Block logic should be readable without diving into UX/HTML/CSS (which is often quite large!), and, perhaps, vice-versa
* Block logic should be usable from node, for example, for offline analytics, in test cases, or in server code
* Block logic may eventually be reusable in mobile or other views

`locals` is passed back into the block through its attributes, so UX code can all its own locals.

#### Graded activities

In general, graded activities are broken up into two parts:

* Inputs
* Graders (in Open edX and LON-CAPA, these were called _response types_)

These can mix-and-match. For example, a grader which expects a number could have one from a:
* Numberline
* Type-in-a-number
* Drop-down with numbers
* ...

Conversely, an input which outputs a number could be connected to:
* A grader which compares a number with a tolerance
* As one of **two** inputs to a grader which checks for a ratio
* To a code grader which checks the value with JavaScript code (e.g. whether it is a square number)
* etc.

Unlike Open edX or LON-CAPA, inputs should be children of the related grader:
```
<NumericalGrader answer="9.8" tolerance="0.1">
  <NumberInput />
</NumericalGrader>
```

If this is impossible, this can be overridden with `target=`. In most cases, both sit inside of a `<CapaProblem>` component, but this is just a template for wiring together a `Correctness` display to show the grade, an `ActionButton` to trigger the grader, a `StatusText` to show feedback, etc. It's possible to do this manually too.

##### Inputs

Blocks advertise themselves as **inputs** using the `blocks.input()` mixin:

```
const MyInput = core({
  ...input(),
  // ... rest of block definition
});
```

This sets `isInput: true`. The factory provides a default `selectValue` that reads `commonFields.value` with an empty-string fallback — sufficient for most simple inputs.

For custom value logic (parsing, multi-field values, etc.), pass `selectValue` to the mixin:

```
const MyInput = core({
  ...input({
    selectValue: (props, state, id) => {
      const raw = fieldSelector(state, { ...props, id }, fields.value);
      return parseFloat(raw) || 0;
    },
  }),
  // ... rest of block definition
});
```

Note: `selectValue` without `isInput: true` does NOT make a block an input. Non-input blocks (e.g. Ref, Tabs, Navigator) can have `selectValue` for programmatic value access without participating in grading.

The `useValue` hook returns `{ value, loading, ready, error }`. It calls `selectValue` if defined, otherwise reads the common `value` field. Most blocks just destructure `value`:

```
const { value } = useValue(props, { fallback: '' });
```

Blocks that need to signal loading/error from `selectValue` (e.g. Ref, which must resolve its target) use the `withStatus` wrapper:

```
import { withStatus, blockData } from '@/lib/state';

selectValue: withStatus((props, state, id) => {
  // ... resolve target ...
  if (targetLoading) return { value: '', ...blockData('loading') };
  return { value: resolvedValue, ...blockData('ready') };
})
```

We plan to move to be more declarative in the future, along the lines of what we do for graders.

##### Graders

A **grader** is an action block that collects values from related inputs (via `target` or inference e.g. `inferRelatedNodes`) and grades them.

Match functions are **pure boolean predicates**. The framework handles the state machine:
- Empty input → UNSUBMITTED
- validateInputs fails → INVALID
- match returns true → CORRECT
- match returns false → INCORRECT

```javascript
// Simple example: exact string match
const simpleMatch = (input, answer) => input === answer;

const SimpleCheck = createGrader({
  base: 'Simple',
  description: 'Exact string match',
  match: simpleMatch,
  inputSchema: z.string(),
  attributes: {
    answer: z.string({ required_error: 'answer is required' }),
  },
});
```

The full signature is:
```
interface CreateGraderConfig {
  base: string;
  description: string;

  // === Core grading ===
  match?: (input: any, pattern: any, options) => boolean;  // Pure predicate!
  grader?: GraderFunction;  // Escape hatch for complex cases

  // === Schemas ===
  inputSchema?: z.ZodType;
  attributes?: Record<string, z.ZodType>;

  // === Validation ===
  validatePattern?: (pattern: any, attrs: Record<string, any>) => string[] | undefined;
  validateInputs?: (input: any, attrs: Record<string, any>) => string[] | undefined;
  // (receives input or inputs based on inputSchema)

  // === Display ===
  getDisplayAnswer?: (props: RuntimeProps) => any;

  // === Extensions ===
  locals?: LocalsAPI;
  infer?: boolean;

  // === Block creation ===
  createMatch?: boolean;
  createGraderBlock?: boolean;

  // === Rendering ===
  component?: React.ComponentType<any>;
  parser?: ParserConfig;
}
```

The result of a grader is logged via the `UPDATE_CORRECT` event and stored in Redux under the `correct` field. Possible values are defined in `blocks.CORRECTNESS`.

In most cases, graders are inferred from `match` and `validateInputs`. However, it's possible to specify one explicitly. A grader function will receive:

- input - Single input value (typical use case); or
- inputs - Array of all input values (for when we expect multiple inputs)

Which one is based on the zod signature `inputSchema`. In contrast to a match function, they also receive `options`, consisting of: `{ props, attributes, inputApi | inputApis /* Bound locals from input or inputs, based on zod signature*/ }

Correctness states are defined in `packages/shared/lib/blocks/correctness.ts` and currently include:  UNSUBMITTED, SUBMITTED, CORRECT, PARTIALLY_CORRECT, INCORRECT, INCOMPLETE, and INVALID. This is inspired by Open edX, but may extend in the future.

When actions execute, they inherit the `idPrefix` from the triggering component. This ensures that graders in scoped contexts (like a problem inside a MasteryBank) update the correct scoped state rather than global state. See "ID Prefixes for Scoped State" below.

#### Actions

Graders are a specialized type of `action`. An action is a block which does something when triggered like:
* Grade
* Call an LLM
* Pop up a dialog
* Etc.

A simple action:
```
import * as blocks from '@/lib/blocks';

const HelloAction = core({
  ...blocks.action({
    action: async ({ targetId, targetInstance, props }) => {
      console.log('Action executed!');
    }
  }),
  name: 'HelloAction',
  // ...
});
```

The easiest way to trigger an action is to put it inside of an `<ActionButton>` component, which triggers all child actions (or ones pointed to with `target=`).

#### Synopsis:

| Property         | Type                  | Description                                                |
|------------------|-----------------------|------------------------------------------------------------|
| description      | string                | Human-readable description (shows in docs).                |
| category         | string                | Override documentation category (default: directory name). |
| internal         | boolean               | Hide from main docs. For system/helper blocks.             |
| requiresUniqueId | boolean|'children'|fn | ID uniqueness requirement (default: true).                 |
| requiresGrader   | boolean               | Block needs a parent grader.                               |
| isGrader         | boolean               | Auto-set by grader() mixin. Adds grader fields.            |
| getDisplayAnswer | fn                    | Returns answer for "Show Answer" feature.                  |

requiresUniqueId options:
- true (default) - All instances must have unique IDs
- false - Duplicates allowed (e.g., Markdown, TextBlock)
- 'children' - Require uniqueness if any child requires it

### `LoBlock`

`BlockBlueprint`s are parsed through zod and the factory into an `LoBlock`. This is quite similar, but with:
* Type validation
* Inference for defaults
* Guaranteed fields (isInput, isMatch, isGrader are always set)
* Additions (e.g. documentation and template files belong here, eventually)
* Etc.

The block lifecycle is: `BlockBlueprint` (what devs write) → `LoBlock` (processed) → `OlxJson` (instance) → `OlxDomNode` (rendered)

## Instantiating Blocks -- Part 1: Static OLX

Blocks can be instantiated into specific nodes in OLX. For example `Markdown` is a block, while:
```
<Markdown id="helloblock">
# Hello World!
- One
- Two
- Three
</Markdown>
```
creates an instance of that block. The OLX is the archival format-of-record for course content. It is parsed into OLX JSON, which at present looks like:

```
"helloblock": {
  "attributes": {
     "id": "helloblock"
  },
  "id": "HelloBlock",
  "kids": "# Hello World!\n- One\n- Two\n- Three",
  "provenance": [
    "inline"
  ],
  "tag": "Markdown"
}
```

This is `OlxJson` in `types/core.ts`.

## Instantiating Blocks -- Part 2: Dynamic DOM

Finally, OLX is dynamically rendered into a JSX DOM with an OLX shadow DOM. The dynamic hierarchy can be -- and often is -- quite different from the static hierarchy.

For example, a `MasteryBank` will pull in kids from a bank of items. A
DynamicList can render a child definition multiple times. Etc. Sadly, this
means that static IDs and dynamic IDs might not be the same:

```
<DynamicList id="list">
  <TextArea id="answer" />
</DynamicList>
```

In Redux developer tools, we would see `list:#0:answer`, `list:#1:answer`,
etc. as IDs for the specific child nodes. The `:` separates scope segments,
and `#` prefixes numeric indices to distinguish them from named blocks. This
is distinct from `<Use>`, which selects an already-named state instance rather
than creating another instance in its surrounding scope.

This is `OlxDomNode` in `types/core.ts`.

# DAG Structure

The content is structured as a DAG, not a tree (I structured Open edX the same way, until people broke it). This is important for many reasons, but it's very common that we have something like:

* Read this problem but don't do it: [Problem]
* Intro video
* Do part 1: [Problem]
* Text about concepts in part 2
* Do part 2: [Problem]
* ...
* Grade yourself on a rubric: [Problem] + [Rubric]

There are many ways to have this work. The `<Use ref="stateRef">` tag is
handled during parsing and creates a DAG (it is not itself added to the DAG).
Its `ref` names an existing runtime state instance: `answer` names the global
instance, while `responses:#3:answer` names a scoped instance. The renderer
uses the leaf (`answer`) to find the block definition and the complete ref to
select its state. Attributes on `<Use>` override those on the referenced block,
so `<Use ref="foo" clip="[8,12]"/>` renders `foo` with a different clip. `<Use>`
does not accept `id=`: it reuses the state identity named by `ref`, rather than
creating an alias or a new instance. The `<UseDynamic target="id">` is its own
block, and renders a subnode.

We can traverse the DAG in two ways:

* The graph API generates a static OLX DAG, based on the kid nodes in the system.
* The render function generates a dynamic DAG (renderedKids), as the system renders them. For reasons, it collapses multiple kids into one node if identical.

The distinction comes in for two reasons:

* Not all child nodes are necessarily rendered. For example, a learning sequences might have 10 elements, but only one shown at a type. The static DAG will have all 10, and the rendered one will have the active child.
* Not all rendered nodes will be in the static bank. For example, a block is welcome to pull nodes out of a problem bank. The UseDynamic block can render literally any node in the system.

## `kids`, `children`, and Shadows.

We have a pipeline from JSX to OLX. Both of these have a hidden DOM. Note that while these often map to each other, this is not universal. The React shadow DOM and the OLX shadow DOM are *not* the same:

* The OLX DOM has blocks which may be composed of many React nodes for complex graphical components.
* The OLX DOM can have elements -- like `action`s -- which have no react nodes.
* The OLX DOM is a DAG. The React one is a tree.

Don't confuse the two.

React has `children`. In React, `children` are required to be React components. That doesn't always work for us, since child nodes often have semantic meaning. We might want to demark them in some way other than order. Passing that via `children` raises exceptions. Ergo, in OLX, we use the `kids` property to refer to child nodes.

Be very mindful of whether you mean `children` or `kids`.

# IDs

IDs are hard. We have internal ID types (static OLX, dynamic OLX, etc.). We interact with other uses of IDs. This contributes a lot to the complexity! For example:

* OLX 1.0 `url_name`: Used as a key. Designed to be human-friendly (e.g. "eigen_pset"), but often GUIDs. This was originally created, in part, so URLs would be friendly (e.g. `/linear_algebra/eigenvalues` instead of `/[GUID]/[GUID]`), and to simplify analytics and debugging. We split this into `DefinitionRef`, `DefinitionKey`, and `ReactKey`.
* OLX 1.0 `display_name`: Human-friendly short decriptive text (e.g. "Eigenvalue Problem Set"). We use `title`.
* HTML `id`: Web-page wide unique ID
* React `key`: Unique identifier, esp. for elements in a list.
* HTML `name` (HTML/DOM Attribute): Names an element (typically form controls for form data submission)
* `displayName` (React-Specific): Human-readable name for a React component, useful for debugging

We are mixing React concepts, OLX concepts, and others. This leads to a rather complex system. It took a while to figure out, and the detailed documentation now lives with the types: `packages/shared/lib/types/core.ts` (the conversion-pathway map) and `packages/shared/lib/types/id-grammar.ts` (the formal grammar and every conversion function).

A few rules:

* IDs support Unicode letters (`\p{L}`), digits, and underscores. The formal grammar is in `packages/shared/lib/types/id-grammar.ts`. Reserved delimiters: `://` (namespace), `:` (scope), `#` (index), `.` (field access).
* Keys should be as semantic and meaningful as possible. `resistor_divider_problem` is better than a SHA hash. A SHA hash is better than a GUID. These feed into downstream analytics. `<Lesson id="linalg_eigen"/>` is a lot nicer to work with than `<Lesson id="3a0512ad31dc81fc166507f20ddebfe700d64daf"/>`. 
* Semantic IDs have many downsides, including key collisions, the associated need for namespaces, and IDs going out-of-date (e.g. a problem changes what it teaches). Those are worth it.
* Every OLX component *must* have an ID. Many of these are auto-assigned.
* As a convention, peer components (e.g. an analytic for another component) will often use `target`. E.g. `<Input id="essay"\>` might have a `<Wordcount target="essay"\>`. We used to have targetRef and others. These should be removed.

**Scoped state**: When a single OLX node is rendered multiple times (e.g., in a list or mastery bank), each instance needs its own Redux state. We handle this with `idPrefix`, which scopes the StateKey:

* OLX node: `<DynamicList id="list"><TextArea id="response"/></DynamicList>`
* DefinitionRef (content identity): `response`
* StateKey (runtime instance): `list:#0:response`, `list:#1:response`, etc.

The `:` separates scope segments. `#` prefixes numeric indices (distinguishing them from named blocks). The `extendIdPrefix(props, scope)` utility builds scoped prefixes for child components.

There are two distinct pathways that produce scoped StateKeys:

1. **Runtime own-state scoping** (`addScope` / `refToStateKey`): Containers like DynamicList pass `idPrefix` via React context. Child components call `refToStateKey(props)` which prepends the accumulated prefix. Authors don't write scope paths — the runtime builds them.

2. **Authored cross-references** (`qualifyStateRef`): Authors write full scope paths in `target=` attributes (e.g., `target="list:#0:answer"`). Only namespace qualification is needed — the scope is already in the ref.

See `id-grammar.ts` NAMESPACE QUALIFICATION section for details.

The `fieldSelector` and `updateField` functions automatically apply `idPrefix`, so components don't need to manually scope IDs.

**Key Assignment** We need to work through key assignment strategy if `id=` is not specified (and sometimes, if it is!).

We would like to have an abstracted set of helpers:

```
// For React reconciliation - handles duplicate IDs in siblings
assignReactKeys(kids: KidNode[]): (KidNode & { key: ReactKey })[]
```

Right now, if an `id` is not provided, we assign one based on a hash of the OLX. This only works-ish. With naive assignment, both of these `ComplexInputs` would share their react state:

**Example of the problem:**
```xml
<CapaProblem id="problem_1">
  <NumericalGrader><ComplexInput /></NumericalGrader>
</CapaProblem>
<CapaProblem id="problem_2">
  <NumericalGrader><ComplexInput /></NumericalGrader>
</CapaProblem>

Without special logic in `CapaProblem`, both `ComplexInput` blocks would get the same hash ID (since their XML content is identical), causing them to update together.

This can lead to many bugs! Container blocks like `CapaProblem` need to assign predictable, unique IDs to all descendant blocks, and the system should provide means to do that (as of this writing, CapaProblem has a hack: Recursively traverse all descendants and MUTATE the XML nodes to add IDs before any parsing -- which might break caching, memoization, static analysis, ...)

Conversely, flagging every duplicate ID as a problem is also not great. The ID for most nodes does not matter, and shared IDs are okay:

```olx
<Markdown>Intro</Markdown>
...
<Markdown>Intro</Markdown>
```
Markdown just renders content -- no state -- and it does not matter if the above share state.

Approaches we'd like to consider:
* Blocks declaratively advertise in their blueprint:
  - Whether shared state is okay
  - Whether an explicit `id=` is required
  - Whether state can mutate under parses (in most cases, this is okay; even a random GUID would be fine -- but this would be downright dangerous for inputs and graders; a changing ID in a course update would cause students to lose their work!)
* Blocks provide *contexts* for child key assignment -- see CapaProblem and DynamicList
* Perhaps, two-stage parsing, to add IDs to OLX
* Perhaps, automatically adding `id=` in the editor / linter / loader, where required

Strategies might include:

  | Strategy            | Deterministic? | Unique?                                        | Stable?                       |
  |---------------------|----------------|------------------------------------------------|-------------------------------|
  | Explicit (id="foo") | Yes            | Author's job                                   | Yes                           |
  | Content hash        | Yes            | No (collisions)                                | Across runs, not edits        |
  | Position-based      | Yes            | Within siblings (globally, with parent prefix) | Across edits, not reorder     |
  | Path-based          | Yes            | Yes                                            | Across runs, not restructure  |
  | Parent-based        | Yes            | Yes                                            | Assuming same parent/siblings |
  | Parent-assigned     | Yes            | Within parent (globally, with parent prefix)   | Depends on parent             |
  | GUID                | No             | Yes                                            | No                            |


Parent-based is helpful for resolving the canonical issue: `<Key>True</Key>` which can appear in hundred of MCQs. A stable key of `[parent]key[sluggified_text]` `hw11Problem3KeyTrue` can resolve this.

It's also very easy for authors to write: `<TextArea id="answer" />` and similar, which can be resolved with prefixes (or author training! or a smart editor!).

Note that we favor semantic ids:

* **Good**: `id=`harvard.edu/writing_101/graphic_organizer_thesis`` (semantic, complete)
* **Okay**: `id=`hw2_problem2` (semantic)
* **Medicocre**: `id=[SHA HASH]` (at least, traceable)
* **Bad**: `id=[GUID]` (impossible to debug)

Note: LLMs can generate very decent semantic IDs.

See `id-grammar.ts` for the namespace grammar and conversion functions. For
ID style in authored content (alignment, semantic naming, which blocks need
explicit ids), see `literate-xml.md` in the repository root.

## Content Addressing and the Naming Hierarchy

The system has three distinct naming levels that connect where content *lives* to how it behaves at runtime:

```
  LofsRef            Where content lives (storage reference)
      │               "git@github.com:olxhub/lo-blocks.git://content/hw1.olx"
      │               "git@github.com:olxhub/lo-blocks.git://content/hw1.olx#main"
      │
      │  addressPath() → DefinitionKey lookup
      │  withoutVersion() strips version for identity
      │
  DefinitionKey      What a block is (content identity)
      │               "week1_problem3"  (a block defined inside hw1.olx)
      │
      │  refToStateKey(props) applies idPrefix
      │
  StateKey           Which runtime instance
                      "mastery:#0:week1_problem3"
```

The existing IDs section above covers DefinitionKey and StateKey in detail. This section documents the storage layer below them.

### LOFS Addresses

A LOFS (Learning Observer File System) address identifies a piece of content at a specific location, optionally at a specific version:

```
source://path[#version]
```

Examples:
```
git@github.com:olxhub/lo-blocks.git://content/myfile.olx
git@github.com:olxhub/lo-blocks.git://content/myfile.olx#main
git@github.com:olxhub/lo-blocks.git://content/myfile.olx#3f41866
file:/home/user/content://myfile.olx
pg://school.edu/cs101://hw1/problem3.olx#v42
memory:session-42://draft.olx
```

The address grammar is designed to handle real-world source locators (which often contain `://`, `@`, colons, and slashes) without ambiguity:

1. **Path**: Split at the *last* `://`. Everything before is the source, everything after is the path-with-optional-version. Source locators may contain `://` (like `file://`, `pg://`), but paths within a source never do.

2. **Version**: In the path part, find `#`. Everything before is the path, everything after is the version. `#` is reserved — it must not appear in paths or source locators. This is unambiguous by design: `#` doesn't appear in file paths (by convention), git ref names (git forbids it), hostnames, or email addresses.

### The LofsRef → LofsCanonical Subtype Hierarchy

This is the critical type distinction in the address system. **`LofsCanonical` is a subtype of `LofsRef`**, and TypeScript enforces the difference at compile time.

```
  LofsRef                              General reference — may be mutable
      │                                 foo://hw1.olx#main      (branch — mutable)
      │                                 foo://hw1.olx#f367812   (specific commit)
      │                                 foo://hw1.olx           (no version — latest)
      │
      └── LofsCanonical                Resolved reference — immutable #version
                                        foo://hw1.olx#3f41866  (commit hash)
                                        file:content://hw1.olx#1714680000-4096  (mtime+size)
```

A `LofsRef` can carry `#branch`, `#hash`, `#version`, or no version at all. A `LofsCanonical` always has a `#version` that is immutable — a git commit hash, an mtime, a content hash, a database version number. The version is provider-opaque: consumers compare versions for equality but never interpret them.

**Why this matters**: `LofsDependencies` (the list of all source files that contributed to an OlxJson node) is `LofsCanonical[]`. If we know exactly which version of each dependency we read, we can detect staleness precisely. With `LofsRef[]`, `foo://hw1.olx#main` tells us nothing — "main" might have moved. With `LofsCanonical[]`, `foo://hw1.olx#3f41866` is immutable and comparable. We also need absolute versions for analytics, and other places where we want to know exactly what the student did.

TypeScript enforces canonicalization: you cannot assign a `LofsRef` where `LofsCanonical` is expected. This catches every place where we forgot to resolve versions at compile time. The canonicalization boundary is at providers and at `parseOLX`. `ReadResult.provenance` is `LofsCanonical`: `FileStorageProvider` includes mtime as `#version`, and `InMemoryStorageProvider` uses a SHA-256 content hash. `parseOLX` accepts `LofsRef[]` input and canonicalizes internally (using content hash as `#version`), so callers never need to pre-canonicalize.

Note that `hasVersion()` returns `boolean`, NOT a type guard. A ref with `#main` has a version but is NOT canonical (main is mutable). Only the provider decides what's canonical — via `toLofsCanonical()` at the point where it resolves what was actually read.

### LofsOrigin

`LofsOrigin` is the source part of an address, stripped of version and path. It identifies *where* content comes from.

```
LofsRef:     git@github.com:olxhub/lo-blocks.git://content/hw1.olx#main
LofsOrigin:  git@github.com:olxhub/lo-blocks.git
```

More examples: `file:/home/user/content`, `pg://school.edu/cs101`, `memory:session-42`.

This was originally intended to be used for namespacing redux and OLX keys. This turned out to be a **bad idea**. 95+% of the time, there is a 1:1 mapping between LofsOrigin and namespace — but the mapping is owned by the storage provider, not derived mechanically from the origin (see "How namespaces are assigned" below). Note that not all repo names are valid namespaces — `lo-blocks` contains a hyphen, which the namespace grammar forbids. Such sources must provide an explicit namespace via `manifest.yaml`. A repo like `git@github.com:other/ee101.git` derives cleanly to namespace `ee101`.

However, we want to maintain the same key for:

- The same repository across forks. If a student did a problem in `gsu/course.git`, it should remain done in `memphis/course.git`.
- The same content in a stack. If I am editing a course on disk, in-memory, etc. we have a **different** origin in the stack, but the same identity.

This is the "identity" dimension — it doesn't change when you switch branches or update files. If a student starts homework on `#ae1f` and the instructor pushes to `#main`, the origin is the same and the student's Redux state survives. Fixing a typo in a piece of content shouldn't cause the student to lose state.

Note, as well, that the same file might be referred to as:

```
git@github.com:other/ee101.git://hw1.olx#main         (mutable branch)
git@github.com:other/ee101.git://hw1.olx#ae1f         (specific commit)
git@github.com:other/ee101.git://hw1.olx              (no version)
```

All three may refer to the same namespace, `ee101`, and will have the same keys.

### Cross-Repository References

DefinitionKeys are namespace-qualified, so cross-source references are unambiguous. A bare ref like `hw1` is qualified against the current namespace at parse time; an explicit cross-namespace ref keeps its prefix:

```
analogForDummies/hw1              (cross-namespace reference)
hw1                               (bare — qualified at parse time)
```

The namespace is a short logical name for a content collection (e.g., `analogForDummies`, `calculusForDummies`), decoupled from physical location — forks, memory overlays, and local checkouts of the same course share a namespace. See `id-grammar.ts` for the namespace grammar.

(`/` separates namespace from id in Keys; `://` is different — it marks
source-qualified refs, raw storage locators that need LOFS resolution
before they can be used as Keys at all.)

### How namespaces are assigned

The storage provider owns namespace resolution: the `StorageProvider`
interface has `namespaceFor(ref) → { ns, manifest? }` (see
`types/storage.ts`, `NamespaceResolution`). This is the single mapping
point between the LOFS scoping system (mounts, paths) and the OLX key
namespace — the two are deliberately distinct scoping systems.

`FileStorageProvider` resolves, in order:

1. **Manifest override**: the nearest ancestor `manifest.yaml` with a
   `namespace:` field, walking from the file's directory up to the
   provider root. This is how `content/psychology/` publishes under
   `psych/` — its manifest declares `namespace: psych`.
2. **Directory convention**: the file's top-level directory name.
   `content/demos/foo.olx` → namespace `demos`.

A file that resolves to neither — a root-level file, or a directory name
the grammar rejects (hyphens, leading digits) — throws
`NamespaceResolutionError` with an author-facing fix-it message. The
content sync surfaces that as a per-file error; `read()` tolerates it
(a root-level config file is readable, it just has no content identity).

A constructor override (`new FileStorageProvider(dir, mount, { ns })`)
declares a whole mount single-namespace, ignoring manifests — a
special-case API for tests and other wonky mounts.

**Manifest changes are tracked.** `manifest.yaml` files join the file
scan, and any manifest add/change/delete re-parses the mount's OLX (a
per-block dependency pointer can't do this: *adding* a manifest affects
files that recorded no pointer). Each parsed block records the manifest
that declared its namespace as `OlxJson.manifest` — versioned namespace
provenance, alongside `source` and `parseDeps`.

### Documentation namespaces (docs.*)

Block documentation examples are themselves a content source.
`DocsStorageProvider` (a translation layer over `FileStorageProvider`,
mounted at `docs://`) serves the block source tree with **per-block**
namespaces: an example file belongs to the block whose name is the
longest prefix of its basename — the same convention the block registry
uses — so `ActionButtonLLM.olx` lands in `docs.ActionButton`.

Per-block granularity is what keeps example ids readable. Every block's
docs can use `id="essay"` without colliding with any other author's
`essay` — the namespace absorbs the collision instead of forcing names
like `essayForActionButtonDocs`. Within one block's namespace, uniqueness
is the block author's job, and the sync's duplicate detection acts as a
lint.

Consequences:

* **Docs embed anywhere.** The default content sync stacks the content
  directory and the docs source into one index, so any course can write
  `<Use ref="docs.ActionButton/essay"/>`.
* **Shared fixtures**: `BlockName*.includes.olx` files sync into the
  block's namespace but are not listed as runnable examples — examples
  reference their content with bare refs. Prefer inlining small content;
  includes are for substantial shared material.
* `_test/` fixtures (intentionally-broken OLX) and `*.pegjs.preview.olx`
  grammar templates (which contain uninjected `{{CONTENT}}` placeholders)
  are excluded from the scan.

### Synthetic namespaces

Content rendered outside any real content source still declares where it
lives — there is no placeholder fallback (a missing namespace throws).
The conventions:

* `system` — system chrome: settings access, notices, UI text
  (`SYSTEM_NS` in `baselineRuntime.ts`)
* `studio` — studio scratch: unsaved demo content, the editor's LLM chat
* `pegPreview` — grammar preview renders
* `memory` — `InMemoryStorageProvider` default for transient files
* `CONTENT` — the test suite's convention (`TEST_NS` in `test-utils.ts`);
  purely historical, has no production meaning

### Namespaces in expressions: id()

Stored values that contain content ids (e.g. a checkbox's list of
selected option ids) are namespace-qualified keys. The state language's
`id()` helper qualifies a bare name against the expression's own
namespace, so authors never write namespaces by hand for same-namespace
comparisons:

```
<Markdown when="id('Part_3_finished') in @completion.value">
```

Already-qualified names pass through, so cross-namespace comparisons use
a plain literal (`'ee101/hw1'`). See `lib/stateLanguage/syntax.md`.

## Kid nodes

We would like most parsers to return renderable portions of their kids in this format:

```typescript
type KidNode =
  | BlockRef                          // Reference to a ParsedNode in idMap
  | TextNode                          // Inline text
  | HtmlNode;                         // Inline HTML

type BlockRef = {
  type: 'block';
  id: IdMapKey;                       // Points to ParsedNode in idMap
  overrides?: Record<string, any>;    // Attribute overrides for this instance
};

type TextNode = {
  type: 'text';
  text: string;
};

type HtmlNode = {
  type: 'html';
  tag: string;
  attributes: Record<string, any>;
  kids: KidNode[];
};
```

Kids might still be strings (for Markdown, PEG), hierarchies (for various navigation blocks), etc. but where convenient, the above should be used. This allows us to use Kids with the simplified `useKids()`.

# Incremental loading

The content supports different loading strategies:
- Grab all content from the server
- Grab an item and its static kids, and load other content dynamically
- Grab each item as its loaded

We might have more strategies in the future (e.g. grab all content from a certain directory or namespace).

The various hooks for rendering blocks will return spinners while a block is loading, as well as an indication if it is ready.

Gotcha: React `<Suspense>` looks like a natural fit here, but as of early 2026, it doesn't really work for this use-case (it runs into serious performance issues where _any_ component might suspend).

# Type Validation, TypeScript, and zod

We are strong types, and we use specific types. We might have a different integer type for cm than for inches, so only the correct things fit together.

We don't use generic types. `string` doesn't help us. In some cases, if something might not be ready for a branded type, we'll use an alias to `string`. A lot of the current branded types started out that way.

We do use compound brands. If something is:
- a file path
- in a content directory
- pointing to olx

We would have brand tags for each of those, so it can be used for anything requiring a path brand, but a generic path would not fit into something requiring an OLX file or a content directory.

As much as possible, we decode at the boundary and brand inward, but isn't always possible. Where it is not, we don't want to skip a validation step, so we do have safe versus unsafe types indicating the level of validation it's gone through. There might be successive levels of validation. For example, if a user types in a string, a lower level might be to check it against a regexp, and a higher follow-on to check if they are a registered user.

This project is TypeScript-optional. We use tools judiciously. Much of our code is intentionally not typed, but we try to be very careful about having type safety and meaningful parameter checking at key interfaces and for key types.

Since the blocks are designed to be developer-friendly, we also use zod for type-validation for our major user-facing APIs. Not that zod supports both parsing and validation. In most cases, we avoid using zod for parsing, as zod may do things like typecast functions in ways which strip metadata. It can also lose important properties, like equality.

```
const parsed = ZodSchema.parse(config); // Validate config
```

But to continue to use `config` rather than `parsed`, or to only use `parsed` for relatively simple types.

Types generally live in `/lib/types/` rather than locally.

# Tools

* All npm scripts automatically use firejail sandboxing when available (see `sandbox.sh`). On Ubuntu, `sudo apt-get install firejail` is recommended but not required. On macOS or other systems, everything works without it.
* The system uses `vite` (dev middleware inside the Hono app server). We used `next.js` until 2026-07; the dynamic development requirements (e.g. ability to dynamically edit and reload blocks) made that kind of framework a poor fit.
* Data streams into the [Learning Observer](https://github.com/ArgLab/writing_observer), which allows for rather rich, real-time dashboard.

Redux
-----

All state is stored in redux. We have helpers to make redux state
management easy, but critically, components can access and modify each
others' state. Dispatching events changing state is the major way
components interact with each other.

Eventually, we'd also like to allow reducers to live serverside, in
_Learning Observer_, for social features like chat.

# Developing in this repo

## Code Complexity and Magic

We have four rings:

1. Core code (core developers)
2. Blocks (broader community)
3. OLX / content (authors)
4. Students

These form a hierarchy:

1. First and foremost is the student learning experience (even if that makes life complex for course authors)
2. Second is the course author experience, even if that makes life hard for developers. Formats and tools should be human-friendly (even if doing so makes them less machine-friendly)
3. Third is the block development experience. We're happy to add a lot of magic and complexity to the core code to keep block code simple, readable, and friendly. The audience might be an undergrad developer or a simpler LLM.

Conversely, operating in each of these rings requires a different
level of expertise:

1. Students: No background assumed
2. Content authors: A few hours training, and some pedagogical expertise
3. Block developers: Clever highschool student or an undergrad researcher
4. Core developers: Professional computer scientists / software engineers

## Code Style

* Avoid renaming / aliasing variables. If there's a conflict with the name `fields`, we don't `import fields as someAlias from @/lib/state`, but we use the fully qualified name: `import * as state from @/lib/state` followed by `state.fields`
* Avoid `await import` unless there are circular dependency issues or browser / node issues. Imports go at the top of the file. If you do need an await import, document why.

# Code Philosophy

* Always leave the codebase cleaner than you found it. A PR doesn't need to be perfect, but it should improve code quality. If there's a pre-existing issue, fix it. Test flakey? TSC issue? Fix it.
* Never paper over bugs. If lint is failing, fix the issue, don't leave a pragma. If something isn't working, don't wrap it. No shortcuts.
* Shortcuts are okay as scaffolding during a refactor or new development, but must be documented as such. HACK, TODO, and similar comments.
* Fail fast. Think many times before having failovers like `?.` We should fail as early as possible.
* Error handling focuses on **understandable, friendly messages** -- not robustness to errors. If OLX has a bug, we'd like to deliver a message a teacher can understand.

## Vertical Integration

Traditional web apps are horizontally-integrated. In redux, we have files for `events`, `actions`, `reducers`, etc. In typical web frameworks, we have logic in `/lib`, associated UX in `/components/`, and pages in `/app/`. This is the **opposite** of what we want in this codebase.

The code is structured, as much as possible, in **atomic, independent, self-contained apps**. The split between e.g. business logic and UX is **within an app** (be that a block, a major page, or otherwise). `redux` is organized around related events, actions, and reducers. Etc.

* `/lib/` forms a runtime for those apps. It's for generic system-wide infrastructure, as well as common utilities. There would never be a directory in `/lib/` specific to an "app".
* `/components/` are for generic, shared components for DRY and common look-and-feel. Components specific to an "app" (be that a block or a page in /app/) belong with the app.

There is no hard-and-fast rule, but code generally migrates from "apps" into the core `/lib/` or `/components/` when:

* It is clean, stable, and mature;
* It is needed at least two places

Apps, internally, of course, should have clear seperation-of-concerns between UX and logic. But conceptually, the structure is `myApplication/businessLogicFile`, `myApplication/uxFile`  and not `businessLogic/applicationFile`, `ux/applicationFile`.

## Test Philosophy

We try to have reasonable unit tests and integration tests. "Reasonable" does not mean "comprehensive." In many projects, test infrastructure becomes heavyweight, introduces subtle couplings, and contorts architecture. We want to avoid that.

* We like tests to act as documentation. Overly-complex ones don't do that. Tests should be understandable.
* We favor short, simple, readable unit tests where it's convenient to have them.
* One simple multidimensional test is better than five unidimensional ones.
* We don't want to introduce extensive stubbing or test fixtures, since those often break abstraction barriers and introduce unnecessary coupling between otherwise-independent pieces of code.
* We do large-scale automated end-to-end test suites (e.g. running all OLX from documentation through render+parse)
* The reactive nature of the code renders itself well to replay tests. This infrastructure is not built, but reducer + event stream + checking aspects of final state is very, very testable.
* We like smoke tests (see if a page renders without a 500 error)

Our experience is that most failure lead to exceptions, crashes, and similar grand failures, so simple end-to-end smoke tests (does every page load?) tend to do most of the work for a minority of the effort and coupling introduced by more comprehensive tests.

What we are very careful to do, however, is to architect for testability of modules. We rely on things like modular reducers, well-defined data formats, and a declarative, functional programming style.

# i18n and global, accessible content

This is in the early stages of development. We are building a **global platform**, and the system should not give preference to English (or any other language). The goal is to develop a robust architecture for a worldwide pool of educators, researchers, and students with diverse languages and cultures. The platform should support:
- Support translanguaging (users reading/writing in multiple languages with priority order)
- Enable cultural adaptation beyond just translation (examples, pedagogy, values, accessibility)
- Support a git-like content model with variants (language, culture, context, accessibility, etc.)
- Track translation versions and re-translate when source changes

We want to support multilingual content and UI while handling the unique challenges of educational content. Locale isn't just language. Robust courses provide contextual variants, not just translations. `en-US` might use baseball, `en-IN`, cricket, and so on.

The dimensions of adaptation (beyond language):

1. Examples - mangoes vs apples, wedding customs, family structures, professional contexts
2. Communication style - thesis-first (Western) vs logic-first (many other cultures), formality levels, directness
3. Representation - imagery, names, scenarios reflecting local demographics
4. Values - what's emphasized (individual achievement vs collective success, innovation vs tradition)
5. Taboos/compliance - religious, legal, cultural sensitivities
6. Pedagogy - teaching styles, assessment approaches vary by culture
7. Accessibility - literacy levels, visual/text ratios, pace
8. Visual language - Emoji? "Serious" colors? "Fun" colors?

With introspectable content + LLM generation + human curation, you could theoretically take any educational content and make it culturally responsive at scale. That's different from traditional i18n.

Our long-term goal is **global collaboration**. This means the editor should eventually support course teams in Israel, Jordan, Poland, Turkey, and Russia collaborating around localized content with a common core. I can adapt content (passing through a translation boundary) and suggest improvments back. A lot of this is about provenance -- e.g. if I translated your content in 2023, and you've updated it, there's a concept of a cross-language diff, where I'd like to be able to adapt the content, while keeping my local language. And vice-versa.

## Terminology

We have several different concepts:

- **Content variant**: E.g. `ar-Arab-SA:no-audio`.
  - **Content locale**: E.g. `ar-Arab-SA`
  - **Other properties**: no-audio, audio-only, etc.
- **User profile**:
  - What language does the user prefer? e.g. `[ar-Arab-SA, pl-Latn-PL]`
  - Context (e.g. audio-only, e.g. while commuting to work)
  - a11y (e.g. vision-impaired)

These can be used to select a specific locale to render by ID. It is very, very easy to confuse these. Metadata defines the **language of the content in a file**:

```
<!--
lang: ar-Arab-SA
-->
```

On the other hand, OLX attributes also **override the user locale*:

```
<!--
lang: en-Latn-GB
-->
<Vertical>
  <Markdown>Mandarin Chinese Assignment 3</Markdown>
  <Problem id="chinese-problem-1" lang='zh-Hans-CN/> <!-- Change / override the internal locale. Of course, this also means this problem is of that locale -->
</Vertical>
```

A *content variant* can be a full code (`en-Latn-US`) or a subset (e.g. `en`). This is common in translation. `2 + 2 = 4` is mostly region-generic, but Arab counries might have `٢ + ٢ = ٤`. Much of English content is global, but a few words and examples (globalization vs. globalisation) are not. We generally prefer the most specific match. And if no match is available, we'd like to fall back to the closest (e.g. Castilian Spanish should fall back to Mexican Spanish over French).

## Translanguaging

We plan to adapt the loading hooks to be able to translanguage content:

- Loading: Show spinner
- Loaded / untranslated: Show best available language, with translation indication
- Translated: Show final version

Hooks are set up for this, but as of this writing, it needs to be wired through.

## Organization

Organization depends on usage. For example, for autogen translation, something along the lines of:

```
content/
  course.olx
  course/
    es.olx
    zh.olx
    ...
  lesson1.olx
  lesson1/
    es.olx
    zh.olx
    ...
```

For course teams collaborating pushing changes back-and-forth, we might conceptually have:

```
content/course/en/[course.olx, lesson1.olx, ...]
content/course/es/*
content/course/zh/*
```
This might be implemented with directories or seperate repositories.

For bilingual lesson authored in Texas, content might be in the same file:
```
content/course/lesson1.olx
<!--
lang: en-Latn-US
-->
<Vertical id="lesson1"> ... </Vertical>
<!--
lang: es-Latn-MX
-->
<Vertical id="lesson1"> ... </Vertical>
```

## Translation Strings

Our translation layer (i18next, see `lib/i18n/blockI18n.ts`) has
block-level and system-level translations. Block-level are scoped to
an individual block (`Block/i18n/en.json`); system-level live in
`lib/i18n/common/en.json` and are shared across all blocks.

Translation strings start within blocks, and if used several places,
bubble up to the platform. "Do a 5-minute quickwrite" belongs in the
block. "Next" in the system. We're still figuring out the lines
between there.

We might have more scopes in the future; blocks often come in groups
(two inputs + an associated grader, or a set of blocks around a
specific pedagogy). But as of this writing, we're nowhere close to
ready for that.

### Key naming conventions

Keys describe the **semantic meaning** of the string, not its
location. A key should make sense both in a block-local namespace and
in the common namespace, because keys may be promoted from local to
common without renaming as usage spreads across blocks.

Good keys:

- `clickToExpand` — clear action, unambiguous
- `compareWithAnswer` — tells a translator the verb's object
- `noTeamMembersFound` — specific situation

Bad keys:

- `collapsibleClickToExpand`, `textSelectionCompare` — block prefix
  bakes in location; forces rename on promotion
- `compare`, `navigation` — too vague; verb form varies by language
  and context. "compare" could be perfective/imperfective (Polish
  *porównaj* vs *porównywać*) or gendered (Arabic قارن vs قارني).

The rule: be specific enough to be globally unambiguous. A translator
seeing only the key (not your component) should understand the
context.

### Interpolation

Uses i18next double-brace syntax: `"Tab {{number}}"`, called as
`t('defaultTabLabel', { number: index + 1 })`.

Field Conventions
-----------------

We'd like blocks to be plug-and-play. Repoint a `target` and go. Switch an input inside a grader, and go. We would like to propose a set of conventions:

* If a block has only one thing it manages, call the field `value.`
* Points go in `grade`: This should be overrideable with a `getGrade` in the blueprint. The structure is { value, maxValue }. _Question: This follows edX. Should this be the more sensible score?_
* Correctness / doneness. edX uses `correct`, but we should use `status`? `done`?

Otherwise, ideally, fields would map 1:1 to OLX attributes as often as
practical, but this is not always practical. OLX is human-facing, and
should have human-friendly semantic names. Fields are designed to be
part of an automated system, and should have standardized names
(e.g. `value`, as per above). For example, a semantic attribute mapped
to `value` is probably better than a bad attribute name or bad field
name.

The rationale here is we can point things by ID. If an instructor
points an action to an OLX ID, the system know to grab or push data to
`id.[value]`.
