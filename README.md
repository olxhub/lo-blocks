Learning Observer Blocks
========================

**Learning Blocks** is a modular, extensible runtime for delivering rich, interactive learning and assessment experiences. It’s part of the [Learning Observer](https://github.com/ETS-Next-Gen/writing_observer) project — a flexible, open, and inspectable platform for learning analytics, course delivery, and authoring.

This repository implements the **delivery and runtime system**: rendering block-based content, managing learner state, and integrating with powerful analytics and feedback pipelines.

---

## 🚀 Overview

Learning Blocks allows you to:

- Render modular lessons and assessments from XML or JSON
- Compose learning experiences using reusable “blocks”
- Enable dynamic, LLM-enhanced input and feedback
- Capture detailed event data for learning research and replay
- Deliver adaptive, inspectable, remixable activities

---

## 🧱 Key Features

- OLX-inspired structure with modern enhancements
- Composable component protocol (with `createBlock()`)
- Redux-based state tracking and dispatch
- Real-time or offline-compatible delivery
- Declarative XML (or JSX) authoring
- Clean introspection metadata for every block
- Seamless integration with [`lo_event`](https://github.com/ETS-Next-Gen/lo_event)

## 🧠 Design Philosophy

- **Functional-first** — blocks are stateless where possible, driven by Redux and `lo_event`
- **Declarative layout** — layouts like `<SideBarPanel>` or `<Lesson>` drive visual structure
- **Composable interactions** — `<LLMButton>` + `<LLMPrompt>` + `<TextArea>` → full loop
- **Minimal magic** — XML → JSX transforms are explicit; no hidden loaders or runtime hacks
- **Batteries included** — reusable reducers, event dispatchers, component selectors

---

## ✍️ Authoring Format

Learning Blocks uses a structured XML format (a successor to the OLX 1.0 format I designed for edX, which is a spiritual successor to the LON-CAPA XML format). It's designed to be as easy to work with as early HTML (recall the 2.0 days, when middle school kids could author?).

Each top-level file is compiled into a normalized ID-based map. All references are via ID; components may be embedded or split across files.

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

---

## 📊 Event Architecture

All interaction flows through [`lo_event`](https://github.com/ETS-Next-Gen/writing_observer/tree/master/modules/lo_event):

- Unified Redux + event dispatcher
- Time-aware and replayable
- Supports real-time dashboards, logs, and analytics
- Hooks into analytics modules such as [`writing_observer`](https://github.com/ETS-Next-Gen/writing_observer)

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
npm run build:all  # Build grammars, registry, and content
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

**CI/CD or pre-sandboxed environments** (GitHub Actions, containerized builds):
- Use automation scripts: `npm run build-automation`, `npm run test-automation`
- These omit Firejail (already running in a sandbox)
- Typical failure signature: `cannot create /run/firejail/profile/...`

### Technologies Used

- **Runtime**: [Next.js 15](https://nextjs.org) (React 19)
- **State management**: [Redux](https://redux.js.org) via [`lo_event`](https://github.com/ETS-Next-Gen/writing_observer/tree/master/modules/lo_event)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com)
- **XML parsing**: [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser)
- **Testing**: [Vitest](https://vitest.dev)
- **Grammar parsing**: [Peggy](https://peggyjs.org/)

### Documentation

- [`docs/AGENTS.md`](docs/AGENTS.md) — Using LLM agents in the authoring workflow
- [`docs/edit-preview-design.md`](docs/edit-preview-design.md) — Editor and preview architecture
- [`docs/backlog.md`](docs/backlog.md) — Development roadmap and known issues

---
