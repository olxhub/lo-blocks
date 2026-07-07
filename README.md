# LO Blocks

**LO Blocks** is a modular, extensible runtime for delivering rich, interactive learning and assessment experiences. It’s part of the [Learning Observer](https://github.com/ArgLab/writing_observer) project — a flexible, open, and inspectable platform for learning analytics, course delivery, assessment and authoring.

This repository implements the **delivery and runtime system**: rendering block-based content, managing learner state, and integrating with powerful analytics and feedback pipelines.

_**History**: This project has a genealogy dating back to at least the nineties; many of the core concepts were created in the [LON-CAPA](https://en.wikipedia.org/wiki/LON-CAPA) system. I built on, improved, and modernized these concepts when I wrote the Open edX platform. In the initial release, these were called XModules. Cale Pennington refactored this into XBlocks, which are still used more-or-less unmodified in the Open edX platform today._

Like these earlier frameworks, LO Blocks allows you to compose learning experiences using reusable “blocks.” This is not very obvious in Open edX, as the authoring and mobile experiences were built by a new team which severely restricted the course experience, but at the time of the original system, these were designed to allow you to fully rewrite the student experience. Although slightly predating [`react`](https://en.wikipedia.org/wiki/React_(software)), the concept was similar:

* UX (learning) components are defined as objects which map into an XML tag
* Courses are authored in an XML format called OLX.

It being 2026 rather than 2011, and `react` now existing, LO Blocks uses `react` directly, rather than (p)reinventing it poorly, as I did in 2011.

It being 2026, we are also LLM-native.

---

## Development: Getting Started

Install dependencies and run the development server:

```bash
npm install
npm run build      # Build grammars, registry, and content
npm run dev        # Start development server at http://localhost:3000
```

For testing:

```bash
npm run test       # Run all tests
```

Our primary development environment is Ubuntu, but we have users / developers on MacOS and Windows (via WSL) as well. We don't have CI/CD outside of Ubuntu, so there are occasionally minor local tweaks needed if you're not on Ubuntu. On Windows, run:

```
# In PowerShell, as administrator:
wsl --install Ubuntu-24.0

# Then, in WSL
git clone https://github.com/olxhub/lo-blocks.git
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
nvm install 22
```

If you'd like LLM-enabled activities, you'll need to set a few environment variables too (see [`docs/llm-setup.md`](docs/llm-setup.md)).

Once the system is running, a good place to navigate is to view /docs/ -- that will demonstrate the capabilities of the system and breadth of activities available.

We _don't_ have a demo server, since we don't have funding for LLM credits (but we'd like one!).

---

## Authoring Format

LO Blocks uses a structured XML format, OLX 2.0, which is a successor to the OLX 1.0 format I designed for edX, which, in turn, is a spiritual successor to the LON-CAPA XML format.

_**Aside**: XML has a bad reputation... for equally bad reasons. It was designed to be a markup language, and HTML 2.0 (defined in SGML, a predecessor to XML) was actually quite friendly. Elementary school students learned it. At some point, it started being used everywhere, [XML-RPC](https://en.wikipedia.org/wiki/XML-RPC), [SOAP](https://en.wikipedia.org/wiki/SOAP), [SAML](https://en.wikipedia.org/wiki/SAML), [ebXML](https://en.wikipedia.org/wiki/EbXML), etc., where it was grossly inappropriate. These attempted to, for example, encode **objects** in a **document language**, and naturally, the result was a train wreck. Ergo, we have JSON, YAML, TAML, and similar **object languages** which are much nicer for encoding objects and data structures (several of which are incorrectly named markup languages -- but end up being just as much of a trainwreck when used as such). However, ourses, assessments, and similar are *documents*, and it's possible to make very nice XML languages for describing them; conversely, object languages (JSON, YAML, etc.) are a nightmare. OLX 1.0 was quite easy-to-author, and many MIT course teams continue to use it directly since it's much more pleasant to work with than a GUI. However, it too has a mixed reputation, as the Open edX OLX exporter is quite horrible and creates machine-generated gobbledygook._

OLX 2 is designed to be as easy to work with as early HTML (recall the 2.0 days, when elementary school kids could author HTML?). For complex activities, we write OLX:

```xml
<SortableInput id="method_sort">
  <Markdown id="step1"> Make an observation </Markdown>
  <Markdown id="step2"> Ask a question      </Markdown>
  <Markdown id="step3"> Form a hypothesis   </Markdown>
  <Markdown id="step4"> Test the hypothesis </Markdown>
  <Markdown id="step5"> Analyze the data    </Markdown>
</SortableInput>
```

Most simple activities have simpler markup languages too. The same could be placed in a SimpleSortable as:

```
Put the scientific method steps in order:
===
1. Ask a question
2. Form a hypothesis
3. Design an experiment
4. Collect data
5. Draw conclusions
```

OLX 2.0 improves on Open edX OLX 1.0 in many ways:

- **Fully-documented**. Documentation is automatically generated from blocks
- **Fully-specified**. We have formal PEG grammars for simple formats, and robust validation for XML formats
- **Comprehensive validation**. A lot of effort went into showing human-friendly errors for validation failures
- **Much more flexible**. We support a rather diverse range of course and activity structures, as well as data flows. As students work through activities, that can trigger changes elsewhere in the course
- **Much more declarative**

The emphasis on usability, documentation, validation, error reporting, etc. makes the authoring extremely LLM-friendly as well.

The archival formats also mean that:

1. **You can get your data out**. If you author a course in either Open edX or in LO Blocks, and you have a conflict with your host, you can take your content elsewhere.
2. **Context is captured**. If a researcher wants to understand what a student was doing, they need **context**. OLX + open-source player + cryptographic versioning mean they have full context of the activity the student was engaged in -- the course, the player, and the activity stream. This is important for open science, for LLM-powered tutoring, etc.
3. **Forks**. Want a version of a course to run in Mongolia? For students with a specific disability? For ELLs? Fork the course, modify it, and run your fork. Bring in changes from upstream, and publish changes where globally-relevant.
4. **Legally-compliant.** Virtually no major education platforms comply with [PPRA](https://www.law.cornell.edu/uscode/text/20/1232h). This doesn't matter without any real possibility of enforcement, but it's a bonus!

(Note: We will build out some GUI authoring tools, but we do recommend serious authors primarily work in OLX, either directly, or more likely, with the help of an LLM)

## Blocks

Blocks are declared using a structured metadata API:

```js
export const TextArea = createBlock({
  component: TextAreaComponent,  // React object
  parser: text,
  namespace: 'core',
  description: 'Multiline student input field'
});
```

A full block will have *many* more properties -- but these can be added incrementally. A minimal one works just fine too!

This ensures that every block is:

- Introspectable (for editors, LLMs, etc.)
- Validated
- Declarative and composable
- Compatible with the event system

You can inspect and render any block by ID at runtime.

We support much more than above -- we can add other types of metadata too which, if in place, allows for automated documentation, validation, etc.

The short story, though, is we can **rapidly** develop new rich, integrated educational interactives.

## Student state management

We manage student state with `redux`. A brief history in time:

1. Old systems would have log files in ad-hoc formats with incomplete data capture
2. xAPI and Caliper defined very nice JSON-per-event formats
3. Open edX defined one which was a little bit more flexible and much more comprehensive (but less standards-compliant)

_Open edX allowed a full reconstruction of history..._

_... but with archeology, which often proved prohibitively difficult in practice._

We manage state with `redux`, which means that:

1. Events are guaranteed to allow us to reconstruct student state
2. There is a deterministic way to do so

This is generations ahead of older standards, and we do support full replay from learning process data.

This also means student state is fully introspectable in the course player, which allows for:

1. Complex data workflows (e.g. students compose a draft, which is shown back to them later for editing)
2. LLMs can know what students are doing

## Accessible, localized, and internationalized

LO Blocks has a _variant_ system, where we can have multiple versions of content for specific languages, disabilities, cultures, and combinations. Support for localized forks for e.g. cultural adaptations or disability accommodations is architected but not yet fully implemented.

OLX is exceptionally well-suited to translanguaging. As of this writing, translanguaging works very well on the backend, and we're just starting to prototype just-in-time. We also support different locales in the same course, or even on the same page, which means that an ELL student can have part of the course in their L1, and part in their L2.

_**Historical aside**: Open edX was quite global for the time, and for our first course, users were almost equally split between US, developing world, and developed world. It also had very good accessibility, with bold plans to implement variants for different groups of students. Sadly, as money came in, rather than implementing variants, accessibility was stripped out (leading to a [well-deserved DoJ enforcement action](https://www.justice.gov/archives/opa/pr/justice-department-reaches-settlement-edx-inc-provider-massive-open-online-courses-make-its))._

## Design philosophy

- **Functional-first** — blocks are stateless where possible, driven by `redux` and `lo_event`
- **Declarative layout** — layouts like `<SideBarPanel>` or `<Lesson>` drive visual structure
- **Composable interactions** — `<LLMButton>` + `<LLMPrompt>` + `<TextArea>` → full loop
- **Minimal magic** — XML → JSX and PEG → JSX transforms are explicit; well-defined grammars and validation
- **Batteries included** — reusable reducers, event dispatchers, component selectors
- **Simple, but scalable** — We can run off of a filesystem locally for development or a research study, or swap out backends to scale. This is common (and working) in the whole of Learning Observer.
- Easy things are easy to author. Hard things are possible too. Long, but smooth learning curve for teachers, faculty, and instructional designers.

## Learning Observer project

LO Blocks is part of the **Learning Observer** ecosystem — a modular, open-science-friendly platform for building next-generation learning tools. Its three major layers are:

- **Data**: Observability + analytics (Learning Observer Core)
- **Delivery**: Block-based learning runtime (this repo)
- **Authoring**: (WIP) LLM-augmented course and assessment design

The system is designed to support human–AI co-authoring, fine-grained pedagogy, and full transparency for researchers and educators.

---

## Contributing

We welcome collaborators, although LO Blocks is an **early-stage prototype** and not really ready for general contribution, and definitely not ready for general use.

If you're interested in:

- Research-driven learning platforms
- Open educational infrastructure
- Transparent, remixable assessment systems

Please talk to us! We're education nerds, and talking is fun.

## Technologies Used

- **Runtime**: [Vite](https://vite.dev) + [Hono](https://hono.dev) (`react`)
- **State management**: [`redux`](https://redux.js.org) via [`lo_event`](https://github.com/ArgLab/writing_observer/tree/master/modules/lo_event)
- **Styling**: [`Tailwind CSS 4`](https://tailwindcss.com)
- **XML parsing**: [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser)
- **Testing**: [`Vitest`](https://vitest.dev)
- **Grammar parsing**: [`Peggy`](https://peggyjs.org/)

## Documentation

- [`docs/README.md`](docs/README.md) — An overview of the system architecture

## ⚖️ License and Legal

lo-blocks is free and open-source software by [Piotr Mitros](http://mitros.org/p). [Project Repository](https://github.com/olxhub/lo-blocks/). [Licensing information](http://mitros.org/p/lo/license.html). Copyright (c) 2011-2026 Piotr Mitros and others. Any representation of another party as the original author or inventor of this tool or methodology is a misrepresentation of origin and authorship (yes, this has been a problem with both this, and prior platforms I've built).

TLDR: AGPL. See `LICENSE.TXT` and `NOTICE.TXT` for details.
