Learning Observer Blocks
========================

**Learning Blocks** is a modular, extensible runtime for delivering rich, interactive learning and assessment experiences. It’s part of the [Learning Observer](https://github.com/ETS-Next-Gen/writing_observer) project — a flexible, open, and inspectable platform for learning analytics, course delivery, and authoring.

This repository implements the **delivery and runtime system**: rendering block-based content, managing learner state, and integrating with powerful analytics and feedback pipelines.

---

## 🚀 Overview

Learning Blocks allows you to:

- Render modular lessons and assessments from XML or markup languages
- Compose learning experiences using reusable “blocks”
- Enable dynamic, LLM-enhanced input and feedback
- Capture detailed event data for learning research and replay
- Deliver adaptive, inspectable, remixable activities
- **Rapidly** develop new rich, integrated educational interactives

---

## 🧱 Key Features

- OLX-inspired structure with modern enhancements
- Composable component protocol (with `createBlock()`)
- Redux-based state tracking and dispatch
- Real-time or offline-compatible delivery
- Declarative XML authoring or simplified markup authoring (with explicit PEG grammars)
- Clean introspection metadata for every block
- Seamless integration with [`lo_event`](https://github.com/ETS-Next-Gen/lo_event)
- Easy things are easy to author. Hard things are possible too. Long, but smooth learning curve for teachers, faculty, and instructional designers.

## 🧠 Design Philosophy

- **Functional-first** — blocks are stateless where possible, driven by Redux and `lo_event`
- **Declarative layout** — layouts like `<SideBarPanel>` or `<Lesson>` drive visual structure
- **Composable interactions** — `<LLMButton>` + `<LLMPrompt>` + `<TextArea>` → full loop
- **Minimal magic** — XML → JSX and PEG → JSX transforms are explicit; well-defined grammars and validation
- **Batteries included** — reusable reducers, event dispatchers, component selectors
- **Simple, but scalable** — We can run off of a filesystem locally for development or a research study, or swap out backends to scale. This is common (and working) in the whole of Learning Observer.

---

## ✍️ Authoring Format

Learning Blocks uses a structured XML format (a successor to the OLX 1.0 format I designed for edX, which is a spiritual successor to the LON-CAPA XML format). It's designed to be as easy to work with as early HTML (recall the 2.0 days, when middle school kids could author?):

```
<SortableInput id="method_sort">
  <Markdown id="step1">Make an observation</Markdown>
  <Markdown id="step2">Ask a question</Markdown>
  <Markdown id="step3">Form a hypothesis</Markdown>
  <Markdown id="step4">Test the hypothesis</Markdown>
  <Markdown id="step5">Analyze the data</Markdown>
</SortableInput>
```

We can have simple formats too:

```
<SimpleSortable id="scientific_method" title="Scientific Method">
Put the scientific method steps in order:
===
1. Ask a question
2. Form a hypothesis
3. Design an experiment
4. Collect data
5. Draw conclusions
</SimpleSortable>
```

Each top-level file is compiled into a normalized ID-based map. All references are via ID; components may be embedded or split across files.

This is very friendly for LLM authoring too.

---

## 🔌 Blocks & Extensibility

Blocks are declared using a structured metadata API:

```
export const TextArea = createBlock({
  component: TextAreaComponent,
  parser: text,
  namespace: 'core',
  description: 'Multiline student input field'
});
```

This ensures that every block is:

- Introspectable (for editors, LLMs, etc.)
- Validated
- Declarative and composable
- Compatible with the event system

You can inspect and render any block by ID at runtime.

We support much more than above -- we can add other types metadata too which, if in place, allows for automated documentation, validation, etc.

---

## 📊 Event Architecture

All interaction flows through [`lo_event`](https://github.com/ETS-Next-Gen/writing_observer/tree/master/modules/lo_event):

- Unified Redux + event dispatcher
- Time-aware and replayable
- Supports real-time dashboards, logs, and analytics
- Hooks into analytics modules such as [`writing_observer`](https://github.com/ETS-Next-Gen/writing_observer)

Because state is managed explicitly through redux, we guarantee the event stream allows a full reconstruction and replay of learner state. It also allows for full introspection and inspection of the system state while debugging.

---

## 🧠 Learning Observer Project

Learning Blocks is part of the **Learning Observer** ecosystem — a modular, open-science-friendly platform for building next-generation learning tools. Its three major layers are:

- **Data**: Observability + analytics (Learning Observer Core)
- **Delivery**: Block-based learning runtime (this repo)
- **Authoring**: (WIP) LLM-augmented course and assessment design

The system is designed to support human–AI co-authoring, fine-grained pedagogy, and full transparency for researchers and educators.

---

## ⚖️ License

This project is licensed under the **GNU Affero General Public License (AGPL)**. See `LICENSE` for details.

---

## 🤝 Contributing

We welcome collaborators working, although Learning Blocks is an **early-stage prototype** and not really ready for general contribution, and definitely not ready for general use.

If you're interested in:

- Research-driven learning platforms
- Open educational infrastructure
- Transparent, remixable assessment systems

Please talk to us! We're education nerds, and talking is fun.

---

## 🛠️ Development

### Getting Started

Install dependencies and run the development server:

```bash
npm install
npm run build      # Build grammars, registry, and content
npm run dev        # Start development server at http://localhost:3000
```

For testing:

```bash
npm run test       # Run all tests
npm run test:unit  # Unit tests only
npm run test:ui    # Interactive test UI
```

### Sandboxed Development

For security, we use [Firejail](https://firejail.wordpress.com/) sandboxing in development to limit the impact of potentially compromised dependencies.

**Local development** (recommended):
- Use standard scripts: `npm run dev`, `npm run build`, `npm run test`
- These are Firejail-wrapped for security

This is helpful for rapid LLM prototyping, which may install untrusted dependencies.

**CI/CD or pre-sandboxed environments** (GitHub Actions, containerized builds):
- Use automation scripts: `npm run build-automation`, `npm run test-automation`
- These omit Firejail (already running in a sandbox)
- Typical failure signature: `cannot create /run/firejail/profile/...`

Contributors have also mentioned this does not work on some operating systems; if not, simply remove `firejail` from `package.json` (or use the automation scripts, if relevant).

### Technologies Used

- **Runtime**: [Next.js 15](https://nextjs.org) (React 19)
- **State management**: [Redux](https://redux.js.org) via [`lo_event`](https://github.com/ETS-Next-Gen/writing_observer/tree/master/modules/lo_event)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com)
- **XML parsing**: [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser)
- **Testing**: [Vitest](https://vitest.dev)
- **Grammar parsing**: [Peggy](https://peggyjs.org/)

### Documentation

- [`docs/README.md`](docs/README.md) — An overview of the system architecture
- [`docs/backlog.md`](docs/backlog.md) — Development roadmap and known issues

---
