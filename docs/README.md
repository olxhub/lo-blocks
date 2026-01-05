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
   OLX →      OlxJson      Static content (**instance** of a LoBlock)
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

##### Graders

A **grader** is an action block that collects values from related inputs (via `target` or inference e.g. `inferRelatedNodes`) and grades them:

```javascript
const SimpleCheck = blocks.test({
  ...blocks.grader({
    grader: (props, { input }) =>
      input === props.answer ? CORRECTNESS.CORRECT : CORRECTNESS.INCORRECT
  }),
  name: 'SimpleCheck',
  component: _Noop
});
```

The result of a grader is logged via the `UPDATE_CORRECT` event and stored in Redux under the `correct` field. Possible values are defined in `blocks.CORRECTNESS`.

Notes:

Graders automatically receive:
- input - Single input value (typical use case)
- inputs - Array of all input values (for when we expect multiple inputs)
- inputApi - Bound locals from the input block
- inputApis - Array of all input APIs

TODO: The above should be handled more declaratively (e.g. if a grader expects one or multiple inputs)

Correctness states are defined in `src/lib/blocks/correctness.js` and currently include:  UNSUBMITTED, SUBMITTED, CORRECT, PARTIALLY_CORRECT, INCORRECT, INCOMPLETE, and INVALID. This is inspired by Open edX, but may extend in the future.

TODO: We also need a Doneness, as well as more standard scoring.

When actions execute, they inherit the `idPrefix` from the triggering component. This ensures that graders in scoped contexts (like a problem inside a MasteryBank) update the correct scoped state rather than global state. See "ID Prefixes for Scoped State" below.

TODO: Graders are also used to auto-generate Match components for use in hinting. E.g. `<StringGrader>` also generates a `<StringMatch>` which can be used to give feedback for specific answers. We should document how (and perhaps improve the API here).

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
  "rawParsed": {
    "Markdown": [
      {
        "#text": "# Hello World!\n- One\n- Two\n- Three",
      }
    ]
  },
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

# IDs

This will explain why IDs are among the most confusing parts of this system. We have many types of IDs:

Type            |  Example                                                                        | Description
----------------|---------------------------------------------------------------------------------|------------
OLX Reference   | `/mit.edu/6002x/resistorProblem`, `resistorProblem`, `../6002x/resistorProblem` | As found in source OLX
OLX Key         | `/mit.edu/6002x/resistorProblem`                                                | As found in key-value stores, etc.
Redux State key | `AdaptivePractice:/mit.edu/6002x/resistorProblem`                               | Modified by OLX namespaces, CapaProblem, DynamicList, etc.
React key | | Most be unique per element
HTML ID   | | Must be unique per page

A few notes:
* An OLX Reference is **not** unique (many-to-many). We need absolute and relative references. **This is unimplemented as of this writing** 
* An OLX Key is **not** unique (one-to-many). It's a DAG, not a tree, and with `Use`, the same key can occur multiple times on the same page.
* In OLX, we write `id=`
* The same Redux State key can occur multiple times on the same page (one-to-many)
* React keys are unique per list
* HTML IDs are unique per page

Notice: We use `/` for namespacing in static OLX, and `:` in the dynamic DOM. **Note:** The current version of the codebase uses `.` instead of `:` as of this writing. This should be fixed soon.

In most cases, namespacing in the OLX DOM is done by attaching an `idPrefix` (which is accumulated in `props`).

## ID Format

OLX IDs should NOT contain: ., /, :, or whitespace (unless being used as part of namespaces), as these characters are reserved as namespace/path delimiters.

However, we are currently doing our best to restrict IDs to [a-z][A-Z]_[0-9]. This is because we're still figuring out formats. We plan to relax this once we know more about what we're doing. If tomorrow, we'd like to introduce ^, #, or otherwise, we want that option. It's not unlikely we'll want to be able to refer to specific versions (e.g. use older content) by version number, git hash, or whatnot, and have other features. Until we figure that out, it makes sense to be conservative in content authoring.

We also have a lot of hacks in code. Common one:
```
  // HACK: Force absolute path for cross-block references.
  const absoluteId = id.startsWith('/') ? id : `/${id}`;
```
And similar. Much of this is now handled by `refToReduxKey` and `refToOlxKey`.

## Branded types

These are defined in `types.ts`:

```typescript
type OlxReference = string & { __brand: 'OlxReference' };  // "/foo", "./foo", "foo"
type OlxKey = OlxReference & { __resolved: true };         // idMap lookup key
type ReduxStateKey = string & { __brand: 'ReduxStateKey' }; // state key with idPrefix
type ReactKey = string & { __brand: 'ReactKey' };          // React reconciliation
type HtmlId = string & { __brand: 'HtmlId' };              // DOM element ID
```

Conversion functions in `idResolver.ts`:
```typescript
// Reference → OlxKey (for idMap lookup, strips prefixes)
refToOlxKey(ref: OlxReference | string): OlxKey

// Props/ref → ReduxStateKey (for state access, applies idPrefix)
refToReduxKey(input: RefToReduxKeyInput): ReduxStateKey

// Validate raw string as OlxReference (at system boundaries)
toOlxReference(input: string, context?: string): OlxReference
```

## Key Assignment Contexts and Helpers

We need to work through key assignment strategy if `id=` is not specified (and sometimes, if it is!).

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

Validation, TypeScript, and zod
-------------------------------

This project is TypeScript-optional. We use tools judiciously. Most of
our code is plain JavaScript, but we try to be very careful about
having type safety and meaningful parameter checking at interfaces.

Since the blocks are designed to be developer-friendly, we also use
zod for type-validation for our major user-facing APIs. Not that zod
supports both parsing and validation. In most cases, we avoid using
zod for parsing, as zod may do things like typecast functions in ways
which strip metadata. It can also lose important properties, like
equality.

```
const parsed = ZodSchema.parse(config); // Validate config
```

But to continue to use `config` rather than `parsed`, or to only use
`parsed` for relatively simple types. 

Short story:

* Internal code: Mostly pure JavaScript
* Interface code: Support TypeScript for the benefit of downstream
  TypeScript projects, and do additional validation

Test Philosophy
---------------

We try to have reasonable unit tests and integration
tests. "Reasonable" does not mean "comprehensive." In many projects,
test infrastructure becomes heavyweight, introduces subtle couplings,
and contorts architecture. We want to avoid that.

* We favor short, simple, readable tests where it's convenient to have
  them. One simple multidimensional test is better than five
  unidimensional ones.
* We like tests to act as documentation. Overly-complex or unreasbale
  ones don't do that.
* We don't want to introduce extensive stubbing or test fixtures,
  since those often break abstraction barriers and introduce
  unnecessary coupling between otherwise-independent pieces of code.

Our experience is that most failure lead to exceptions, crashes, and
similar grand failures, so simple end-to-end smoke tests (does every
page load?) tend to do most of the work for a minority of the effort.

What we are very careful to do, however, is to architect for
testability of modules. We rely on things like modular reducers,
well-defined data formats, and a declarative, functional programming
style.

Tools
-----

* The system runs in firejail, a lightweight sandbox. This helps
  mitigate the risk from e.g. a compromised `npm` package
* The system uses `next.js`. We like `next.js`, but the rather unusual
  dynamic development requirements (e.g. ability to dynamically edit
  and reload blocks) may make this type of framework a poor fit. At
  some point, we should evaluate `vite`, other frameworks, or rolling
  our own.
* Data streams into the [Learning
  Observer](https://github.com/ETS-Next-Gen/writing_observer), which
  allows for rather rich, real-time dashboard.

Names and IDs
-------------

We are mixing React concepts, OLX concepts, and others. Just to keep
things clear, here is a list of *external* names and keys -- meaning
ones from other systems where we'd like to maintain compatibility:

* `url_name`: Used as a key in OLX 1.0. Designed to be human-friendly
  (e.g. "eigen_pset"), but often GUIDs. This was originally created,
  in part, so URLs would be friendly
  (e.g. `/linear_algebra/eigenvalues` instead of `/[GUID]/[GUID]`),
  and to simplify analytics and debugging.
* `display_name`: Human-friendly short decriptive text
  (e.g. "Eigenvalue Problem Set")
* `id` (HTML / DOM Attribute): Web-page wide unique ID
* `key` (React-specific): Unique identifier, esp. for elements in a
  list.
* `name` (HTML/DOM Attribute): Names an element (typically form controls
  for form data submission)
* `displayName` (React-Specific): Human-readable name for a React
  component, useful for debugging

Internally, we need to refer to keys for *state* and for
*layout*. State may be shared across multiple elements in a
layout. For example, a video player, subtitles, and scrubber may have
the same *state ID* (e.g. component ID in redux) but need a different
HTML `id` and react `key`

Again, stylistically, we aim to use *semantic keys* where possible,
for the same reasons as `url_name` in edX:
  <Lesson id="linalg_eigen"/>
is much easier to understand than:
  <Lesson id="3a0512ad31dc81fc166507f20ddebfe700d64daf"/>

This has many downsides, including key collisions, the associated need
for namespaces, and IDs going out-of-date (e.g. a problem changes what
it teaches). We've made the decision to accept those.

Every OLX component *must* have an ID, however.

Peer components (e.g. an analytic for another component) will often
use `target` to refer to their "main" redux state:

`
  <Input id="essay"\>
  <Wordcount target="essay"\>
`

We are still trying to figure this out, but
`src/lib/blocks/idResolver.ts` is a stab at trying to make
context-relevant blocks. This allows us to, instead of passing IDs, to
pass around `props`, and change the logic around extracting IDs as
this evolves and as we figure things out.

At this stage, though, we have two main ID types:

* `reduxKey` - The key used to store component state in Redux.
  May include `idPrefix` for scoped instances (e.g., `list.0.response`).
* `olxKey` - The base ID used for idMap lookup.
  Just the plain ID without prefixes (e.g., `response`).

And two functions to convert refs to these types:

* `refToReduxKey(props)` - Converts a ref to a reduxKey.
* `refToOlxKey(ref)` - Converts a ref to an olxKey.

This distinction came down when handling lists in a graphic organizer
and considering certain types of templated content. One OLX node
definition may come up multiple times in a render if it is e.g. from
an expanding list of documents in a graphic organizer.

### ID Prefixes for Scoped State

When a single OLX node is rendered multiple times (e.g., in a list or
mastery bank), each instance needs its own Redux state. We handle this
with `idPrefix`, which scopes the Redux key:

```
OLX node: <TextArea id="response"/>

Without prefix:  Redux key = "response"
With prefix:     Redux key = "list.0.response", "list.1.response", etc.
```

The `extendIdPrefix(props, scope)` utility builds scoped prefixes for
child components. Components that render children with scoped state
(DynamicList, MasteryBank) use this:

```javascript
// In a list component:
renderCompiledKids({ ...props, ...extendIdPrefix(props, `${id}.${index}`) })

// In MasteryBank (scoped by attempt number):
render({ ...props, node: problemNode, ...extendIdPrefix(props, `${id}.attempt_${n}`) })
```

### ID Path Syntax

When referencing other components' state (e.g., a grader looking up an
input's value, or a child referencing a parent), IDs support path-like
syntax to control whether the `idPrefix` is applied:

* `foo` — **Relative** (default): `idPrefix` is applied. Most common case.
* `/foo` — **Absolute**: Bypasses `idPrefix`, references global state.
* `./foo` — **Explicit relative**: Same as `foo`, but clearer in intent.
* `../foo` — **Parent scope**: Not yet implemented.

This matters when a component inside a scoped context (like a problem
inside a MasteryBank) needs to reference something outside that scope.

The `fieldSelector` and `updateReduxField` functions automatically
apply `idPrefix` to ID overrides, so components don't need to manually
scope IDs. If you pass `{ id: 'parent_input' }` to these functions and
`idPrefix` is set, the lookup will use `prefix.parent_input`. To bypass
this, use `{ id: '/parent_input' }`.

DAG Structure
-------------

The content is structured as a DAG, not a tree (I structured Open edX
the same way, until people broke it). This is important for many
reasons, but it's very common that we have something like:

* Read this problem but don't do it: [Problem]
* Intro video
* Do part 1: [Problem]
* Text about concepts in part 2
* Do part 2: [Problem]
* ...
* Grade yourself on a rubric: [Problem] + [Rubric]

There are many ways to have this work. The <Use ref="id"> tag is
handled during parsing and creates a DAG (it does not take its own ID,
since it is not itself added to the DAG). Attributes on <Use> override
those on the referenced block, so `<Use ref="foo" clip="[8,12]"/>` will
render the block "foo" with a different clip. The <UseDynamic target="id">
is its own block, and renders a subnode.

We can the DAG in two ways:

* The graph API generates a static OLX DAG, based on the kid nodes
  in the system.
* The render function generates a dynamic DAG (renderedKids), as the
  system renders them. For reasons, it collapses multiple kids into
  one node if identical.

The distinction comes in for two reasons:

* Not all child nodes are necessarily rendered. For example, a
  learning sequences might have 10 elements, but only one shown at a
  type. The static DAG will have all 10, and the rendered one will
  have the active child.
* Not all rendered nodes will be in the static bank. For example, a
  block is welcome to pull nodes out of a problem bank. The UseDynamic
  block can render literally any node in the system.

`kids`, `children`, and Shadows.
--------------------------------

We have a pipeline from JSX to OLX. Both of these have a hidden
DOM. Note that while these often map to each other, this is not
universal. The React shadow DOM and the OLX shadow DOM are *not* the
same:

* The OLX DOM has blocks which may be composed of many React nodes for
  complex graphical components.
* The OLX DOM can have elements -- like `action`s -- which have no
  react nodes.
* The OLX DOM is a DAG. The React one is a tree.

Don't confuse the two.

React has `children`. In React, `children` are required to be React
components. That doesn't always work for us, since child nodes often
have semantic meaning. We might want to demark them in some way other
than order. Passing that via `children` raises exceptions. Ergo, in
OLX, we use the `kids` property to refer to child nodes.

Be very mindful if you mean `children` or `kids`.

Redux
-----

All state is stored in redux. We have helpers to make redux state
management easy, but critically, components can access and modify each
others' state. Dispatching events changing state is the major way
components interact with each other.

Eventually, we'd also like to allow reducers to live serverside, in
_Learning Observer_, for social features like chat.

Code philosophy
---------------

We have four rings:

1. Core code (core developers)
2. Blocks (broader community)
3. OLX / content (authors)
4. Students

These form a hierarchy:

1. First and foremost is the student learning experience (even if that
   makes life complex for course authors)
2. Second is the course author experience, even if that makes life
   hard for developers. Formats and tools should be human-friendly
   (even if doing so makes them less machine-friendly)
3. Third is the block development experience. We're happy to add a lot
   of magic and complexity to the core code to keep block code simple,
   readable, and friendly. The audience might be an undergrad developer
   or a simpler LLM.

Conversely, operating in each of these rings requires a different
level of expertise:

1. Students: No background assumed
2. Content authors: A few hours training, and some pedagogical expertise
3. Block developers: Clever highschool student or an undergrad researcher
4. Core developers: Professional computer scientists / software engineers

Code Style
----------

Avoid renaming / aliasing variables. If there's a conflict with the name
`fields`, we don't `import fields as f from @/lib/state`, but we use the
fully qualified name: `import * as state from @/lib/state` followed
by `state.fields`

Avoid `await import` unless there are circular dependency issues or
browser / node issues. Imports go at the top of the file. If you do
need an await import, document why.

Field Conventions
-----------------

We'd like blocks to be plug-and-play. Repoint a `target` and
go. Switch an input inside a grader, and go. We would like to propose
a set of conventions:

* If a block has only one thing it manages, call the field `value.`
* Points go in `grade`: This should be overrideable with a `getGrade`
  in the blueprint. The structure is { value, maxValue }. _Question:
  This follows edX. Should this be the more sensible score?_
* Correctness / doneness. edX uses `correct`, but we should use
  `status`? `done`?

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
