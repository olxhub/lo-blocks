Learning Observer Blocks -- Design Documentation
================================================

This is design documentation for both humans and LLMs.

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

Running `npm run build` (or, more narrowly, `npm run-script build:gen-block-registry`) collects all block blueprints into `src/components/blockRegistry.js`. At this point, we can use the blocks in courseware.

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
  name: 'LineInput',
  description: 'Single-line text input field for student responses',   // For documentation
  component: _LineInput,
  fields,                                                              // Where we store our state in redux
  getValue: (props, state, id) =>                                      // What data we send to a grader
    fieldSelector(state, { ...props, id }, fields.value, { fallback: '' }),
  attributes: baseAttributes.extend({                                  // Validation for our attributes
    ...placeholder,
    type: z.enum(['text', 'number', 'email']).optional().describe('HTML input type'),
  }),
});
```
As well as associated documentation files

**Note**: `core` / `dev` / `test` are defined in `src/lib/blocks/namespaces.js` as `lib.blocks.factory.blocks('org.mitros.core')`. We expect institutions to create their own blocks, namespaces, and to avoid conflicts, to eventually implement the possibility to use fully-referenced names (`<edu.mit.Video>` versus `<edu.cmu.Video>`, with `<Video>` defaulting to the local one, and even `xmlns` support). But that's overkill for now.

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
| parsers.text({ postprocess: 'stripIndent' }) | For Markdown                  | Strips leading indentation from multiline text. |
| parsers.text({ postprocess: 'none' })        | Raw text                      | Preserves all whitespace.                       |
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

Blocks can advertise themselves as **inputs** by supplying a `getValue` selector, e.g.:

```
  getValue: (props, state, id) => fieldSelector(state, { ...props, id }, fields.value, { fallback: '' }),
```

For standard fields like `value`, use `commonFields.value` in your field definition and `fields.value` in your selectors. This provides type safety and ensures cross-component field access works correctly.

```
// In block definition:
import { fieldSelector, commonFields } from '@/lib/state';
export const fields = state.fields([commonFields.value]);

// In getValue:
getValue: (props, state, id) => fieldSelector(state, { ...props, id }, fields.value, { fallback: '' })
```

The `useValue` hook will either use the `value` field or call the `getValue` function on any block.

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

Correctness states are defined in `src/lib/blocks/correctness.js` and currently include:  UNSUBMITTED, SUBMITTED, CORRECT, PARTIALLY_CORRECT, INCORRECT, INCOMPLETE, and INVALID. This is inspired by Open edX, but may extend in the future.

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

This is `OlxJson` in types.ts.

## Instantiating Blocks -- Part 2: Dynamic DOM

Finally, OLX is dynamically rendered into a JSX DOM with an OLX shadow DOM. The dynamic hierarchy can be -- and often is -- quite different from the static hierarchy.

For example, a `MasteryBank` will pull in kids from a bank of items. A DynamicList can render an item multiple times. Etc. Sadly, this means that static IDs and dynamic IDs might not be the same. If we put the above node into a dynamic list:

```
<DynamicList id="list">
  <Use id="helloblock">
</DynamicList>
```

If the `helloblock` was something with state, and we pulled up redux developer tools, we would see `list.0.helloblock`, `list.1.helloblock`, etc. as IDs for the specific child nodes.

This is `OlxDomNode` in types.ts.

# DAG Structure

The content is structured as a DAG, not a tree (I structured Open edX the same way, until people broke it). This is important for many reasons, but it's very common that we have something like:

* Read this problem but don't do it: [Problem]
* Intro video
* Do part 1: [Problem]
* Text about concepts in part 2
* Do part 2: [Problem]
* ...
* Grade yourself on a rubric: [Problem] + [Rubric]

There are many ways to have this work. The <Use ref="id"> tag is handled during parsing and creates a DAG (it does not take its own ID, since it is not itself added to the DAG). Attributes on <Use> override those on the referenced block, so `<Use ref="foo" clip="[8,12]"/>` will render the block "foo" with a different clip. The <UseDynamic target="id"> is its own block, and renders a subnode.

We can the DAG in two ways:

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

Be very mindful if you mean `children` or `kid

# IDs

IDs are hard. We have internal ID types (static OLX, dynamic OLX, etc.). We interact with other uses of IDs. This contributes a lot to the complexity! For example:

* OLX 1.0 `url_name`: Used as a key. Designed to be human-friendly (e.g. "eigen_pset"), but often GUIDs. This was originally created, in part, so URLs would be friendly (e.g. `/linear_algebra/eigenvalues` instead of `/[GUID]/[GUID]`), and to simplify analytics and debugging. We split this into `OlxReference`, `OlxKey`, and `ReactKey`.
* OLX 1.0 `display_name`: Human-friendly short decriptive text (e.g. "Eigenvalue Problem Set"). We use `title`.
* HTML `id`: Web-page wide unique ID
* React `key`: Unique identifier, esp. for elements in a list.
* HTML `name` (HTML/DOM Attribute): Names an element (typically form controls for form data submission)
* `displayName` (React-Specific): Human-readable name for a React component, useful for debugging

We are mixing React concepts, OLX concepts, and others. This leads to a rather complex system. It took a while to figure out, and we're moving detailed documentation from here to `lib/types.ts` now that it appears to be mostly figured-out.

A few rules:

* Use [a-z][A-Z][0-9]_ in IDs. Avoid other characters, except as delimeters. We may extend this later, but first, we need to figure out what to reserve and for what purpose.
* Keys should be as semantic and meaningful as possible. `resistor_divider_problem` is better than a SHA hash. A SHA hash is better than a GUID. These feed into downstream analytics. `<Lesson id="linalg_eigen"/>` is a lot nicer to work with than `<Lesson id="3a0512ad31dc81fc166507f20ddebfe700d64daf"/>`. 
* Semantic IDs have many downsides, including key collisions, the associated need for namespaces, and IDs going out-of-date (e.g. a problem changes what it teaches). Those are worth it.
* Every OLX component *must* have an ID. Many of these are auto-assigned.
* As a convention, peer components (e.g. an analytic for another component) will often use `target`. E.g. `<Input id="essay"\>` might have a `<Wordcount target="essay"\>`. We used to have targetRef and others. These should be removed.

**Scoped state**: When a single OLX node is rendered multiple times (e.g., in a list or mastery bank), each instance needs its own Redux state. We handle this with `idPrefix`, which scopes the Redux key:

* OLX node: `<DynamicList id="list"><TextArea id="response"/></DynamicList>`
* OLXReference has no prefix: `response`
* ReduxStateKey has a prefix: `list:0:response`, `list:1:response`, etc.

The `extendIdPrefix(props, scope)` utility builds scoped prefixes for child components.

When referencing other components' state (e.g., a grader looking up an input's value, or a child referencing a parent), IDs should support path-like syntax to control whether the `idPrefix` is applied:

* `foo` — **Relative** (default): `idPrefix` is applied. Most common case.
* `/foo` — **Absolute**: Bypasses `idPrefix`, references global state.
* `./foo` — **Explicit relative**: Same as `foo`, but clearer in intent.
* `../foo` — **Parent scope**: Not yet implemented.

This matters when a component inside a scoped context (like a problem inside a MasteryBank) needs to reference something outside that scope.

The `fieldSelector` and `updateField` functions automatically apply `idPrefix` to ID overrides, so components don't need to manually scope IDs. If you pass `{ id: 'parent_input' }` to these functions and `idPrefix` is set, the lookup will use `prefix.parent_input`.

Right now, this is a little bit confusing, since we have two types of scoping:

* Static scoping (e.g. `mit.edu/pmitros/6002x/hw1/problem5`) at the OLX Key level. `/` seperator
* Dynamic scoping (e.g. `DynamicList`). `:` separator

Which we still need to figure out how to best manage both in a developer- and human-friendly way.

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

Also: Namespaces still need to be figured out.

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

This project is TypeScript-optional. We use tools judiciously. Most of our code is plain JavaScript, but we try to be very careful about having type safety and meaningful parameter checking at interfaces.

Since the blocks are designed to be developer-friendly, we also use zod for type-validation for our major user-facing APIs. Not that zod supports both parsing and validation. In most cases, we avoid using zod for parsing, as zod may do things like typecast functions in ways which strip metadata. It can also lose important properties, like equality.

```
const parsed = ZodSchema.parse(config); // Validate config
```

But to continue to use `config` rather than `parsed`, or to only use `parsed` for relatively simple types.

Short story:

* Internal code: Mostly use pure JavaScript, except for what's in types.ts:
  - Major types
  - Branded IDs
* Interface code: Support TypeScript for the benefit of downstream TypeScript projects, and do additional validation

Most of the other typescript is to prevent errors. We don't proactively tag types.

# Tools

* The system runs in firejail, a lightweight sandbox. This helps mitigate the risk from e.g. a compromised `npm` package. Developers on some systems find they need to disable this. If you're in a defective operating system, just remove the `firejail` from `package.json`.
* We also have automation versions of scripts (github CI/CD, online LLMs, etc. don't have Firejail installed). You can use those, but those are designed for machines and not humans. The system uses `next.js`. We like `next.js`, but the rather unusual dynamic development requirements (e.g. ability to dynamically edit and reload blocks) may make this type of framework a poor fit. At some point, we should evaluate `vite`, other frameworks, or rolling our own.
* Data streams into the [Learning Observer](https://github.com/ETS-Next-Gen/writing_observer), which allows for rather rich, real-time dashboard.

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

Traditional web apps are horizontally-integrated. In redux, we have files for `events`, `actions`, `reducers`, etc. In `next.js`, we have logic in `/lib`, associated UX in `/components/`, and pages in `/app/`. This is the **opposite** of what we want in this codebase.

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
