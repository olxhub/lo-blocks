// src/components/componentMap.js
import React from 'react';

import * as BlockRegistry from './blockRegistry.js';
import createStubBlock from '@/components/blocks/StubBlock';

export const COMPONENT_MAP = { ...BlockRegistry };

// We add dummy development components here.
[
  'LLMButton',
  'LLMPrompt',
  'Element',
  'Sidebar',
  'MainPane',
].forEach(name => {
  COMPONENT_MAP[name] = createStubBlock(name, 'org.mitros.dev');
});

// We will validate it here, looking for common error(s).
function assertValidComponent(component, name) {
  if (typeof component !== "function") {
    console.log("Failed to validate", name, component, typeof component, component.name);
    throw new Error(
      `Component "${name}" is invalid. This may be due to importing a "use client" component in a server context. ` +
      `Make sure all client components are only used in client files.`
    );
  }
  if (!component._isBlock) {
    throw new Error(
      `Component "${name}" does not appear to be a valid block (missing "_isBlock" flag). ` +
      `Make sure it's created with createBlock().`
    );
  }
}

// Usage:
Object.entries(COMPONENT_MAP).forEach(([name, entry]) => {
  assertValidComponent(entry, name);
});
