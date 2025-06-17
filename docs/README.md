Learning Observer Blocks -- Design Documentation
================================================

This is design documentation for both humans and LLMs.

Directory Structure
-------------------


Blocks
------

Learning Observer blocks are similar to Open edX XBlocks and React
components: each block will typically define an XML tag, which can
then be used in courseware.

### Inputs and graders

Blocks can advertise themselves as **inputs** by supplying a `getValue`
function. Other blocks can then query their values directly from the
Redux store. A **grader** is an action block that collects values
from related inputs (via `targets` or inference) and passes them to a
grader function.

```javascript
const SimpleCheck = blocks.test({
  ...blocks.grader({
    grader: (props, input) =>
      input === props.answer ? CORRECTNESS.CORRECT : CORRECTNESS.INCORRECT
  }),
  name: 'SimpleCheck',
  component: _Noop
});
```

The result of a grader is logged via the `UPDATE_CORRECT` event and stored
in Redux under the `correct` field. Possible values are defined in
`blocks.CORRECTNESS`.

This terminology may change slightly by the time you read this for
better alignment with existing systems, as well as for being more
human-friendly.

We did this slightly already; graders, in LON-CAPA and then edX, were
called response types.

Block Registry
--------------

We put our blocks in the `/src/components/blocks` directory. The
command `npm run-script build:gen-block-registry` then creates a file
`src/components/blockRegistry.js` which has all the blocks re-exported
(e.g. `export { default as HelloAction } from './blocks/HelloAction';`

Once we're more dynamic, we will want to do this dynamically. That may
necessitate a move away from next.js.

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
`src/lib/blocks/idResolver.js` is a stab at trying to make
context-relevant blocks. This allows us to, instead of passing IDs, to
pass around `props`, and change the logic around extracting IDs as
this evolves and as we figure things out.

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
since it is not itself added to the DAG). The <UseDynamic target="id">
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