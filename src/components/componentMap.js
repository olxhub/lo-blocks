import { debug, Trace } from '@/lib/debug';

import { render } from '@/lib/render';

import DigitSpanTask from '@/components/blocks/DigitSpanTask';
import InlineMath from '@/components/blocks/InlineMath';
import BlockMath from '@/components/blocks/BlockMath';
import SideBarPanel from '@/components/blocks/SideBarPanel';
import Spinner from '@/components/blocks/Spinner';
import TextInput from '@/components/blocks/TextInput';
import TextBlock from '@/components/blocks/TextBlock';
import QuestionBlock from '@/components/blocks/QuestionBlock';
import ProblemBlock from '@/components/blocks/ProblemBlock';
import LLMFeedback from '@/components/blocks/LLMFeedback';
import Lesson from '@/components/blocks/Lesson';
import React from 'react';

import createStubBlock from '@/components/blocks/StubBlock';

// Block registry
export const COMPONENT_MAP = {
  DigitSpanTask,
  InlineMath,
  BlockMath,
  Spinner,
  TextBlock,
  QuestionBlock,
  Lesson,
  ProblemBlock,
  TextInput,
  LLMButton: createStubBlock('LLMButton', 'org.mitros.dev'),
  LLMFeedback,
  LLMPrompt: createStubBlock('LLMPrompt', 'org.mitros.dev'),
  Element: createStubBlock('Element', 'org.mitros.dev'),
  SideBarPanel, //: createStubBlock('SideBarPanel', 'org.mitros.dev'),
  Sidebar: createStubBlock('Sidebar', 'org.mitros.dev'),
  MainPane: createStubBlock('MainPane', 'org.mitros.dev'),
};

// We will validate it here, looking for common error(s).
function assertValidComponent(component, name) {
  if (
    typeof component !== "object"
  ) {
    console.log("Failed to validate", name, component, typeof component, component.name);
    throw new Error(
      `Component "${name}" is invalid. This may be due to importing a "use client" component in a server context. ` +
      `Make sure all client components are only used in client files.`
    );
  }
}

// Usage:
Object.entries(COMPONENT_MAP).forEach(([name, entry]) => {
  assertValidComponent(entry, name);
});
