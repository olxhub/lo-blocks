We're building a modular open source system to help kids learn.

Please look at /docs/README.md
This will give a good overview of the system architecture!

A few notes, based on seeing your prior runs:

If you run `grep -R`, so it over src. If you accidentally include node_modules, you'll cap out your line limit.

The normal tests run in a sandbox, which you don't have. To run tests, you'll need:

   npm run test-automation

This requires an `npm install` and an `npm build-automation`.

Sometimes, LLM providers are flakey, and these commands might fail for reasons outside of your control (e.g. no network access). If so, signal that to the user; agents have been surprisingly resilient trying to work around this. Of course, if it's just a bug, please try to fix it.

When creating new files, it's surprisingly handy to give the location of the file at the top with a short comment like:
// src/components/navigation/ComponentNav.tsx

(Although we've forgotten to do this on most files)
