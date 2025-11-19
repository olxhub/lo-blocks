// src/components/blocks/Chat/_Chat.jsx
'use client';

import React, { useCallback, useMemo, useState, useEffect } from 'react';

import { useReduxState, updateReduxField } from '@/lib/state';
import { ChatComponent, InputFooter, AdvanceFooter } from '@/components/common/ChatComponent';
import { DisplayError } from '@/lib/util/debug';

import * as chatUtils from './chatUtils';
import { getValueById } from '@/lib/blocks';
import * as state from '@/lib/state';

/* ----------------------------------------------------------------
 * Advance Handler Registry
 * -------------------------------------------------------------- */
const advanceHandlers = new Map();

export function registerChatAdvanceHandler(id, handler) {
  if (!id || typeof handler !== 'function') return;
  advanceHandlers.set(id, handler);
}

export function unregisterChatAdvanceHandler(id, handler) {
  if (!id) return;
  const existing = advanceHandlers.get(id);
  if (existing === handler) {
    advanceHandlers.delete(id);
  }
}

export function callChatAdvanceHandler(id) {
  const handler = advanceHandlers.get(id);
  if (typeof handler === 'function') {
    handler();
    return true;
  }
  console.warn(`[Chat] No advance handler registered for ${id}`);
  return false;
}

/* ----------------------------------------------------------------
 * Wait Command Requirement Checking
 * TODO much of this logic can also be used for disabling blocks.
 * This code should be abstracted so we can also do things like:
 *   `<ActionButton dependsOn="radio_button_id,quiz_1>0.8"/>`
 * The `dependsOn` parameter should follow the chat peg files
 * wait command syntax. We should re-use the satisfaction logic.
 * -------------------------------------------------------------- */
function checkSatisfaction(requirement, value) {
  // TODO the requirement might include an operation like `score>0.8`
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) return true;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
}

function requirementValueFromGrader(props, id) {
  try {
    const correctField = state.componentFieldByName(props, id, 'correct');
    return state.selectFromStore(correctField, {
      id,
      fallback: 0,
      selector: s => s?.score ?? s
    });
  } catch (error) {
    console.warn(`[Chat] Unable to read grader correctness for ${id}`, error);
    return undefined;
  }
};

async function isRequirementSatisfied(props, requirement) {
  if (!requirement?.id) return false;
  try {
    const blockValue = await getValueById(props, requirement.id);
    if (blockValue !== undefined) {
      return checkSatisfaction(requirement, blockValue);
    }
  } catch (error) {
    console.warn(`[Chat] getValueById failed for wait requirement ${requirement.id}`, error);
  }
  const blockScore = requirementValueFromGrader(props, requirement.id);
  return checkSatisfaction(requirement, blockScore)
};

/**
 * Check if all wait requirements are satisfied
 * @param {Object} props - Component props for context
 * @param {Array} requirements - Array of requirement objects with {id}
 * @returns {Promise<boolean>} - True if all requirements are satisfied
 */
async function checkRequirements(props, requirements) {
  if (!requirements?.length) return true;
  try {
    const results = await Promise.all(
      requirements.map(async (requirement) => {
        try {
          return await isRequirementSatisfied(props, requirement)
        } catch (error) {
          console.warn(`[Chat] Failed to resolve wait requirement ${requirement.id}`, error);
          return false;
        }
      })
    );
    return results.every(Boolean);
  } catch (error) {
    console.warn('[Chat] Failed to resolve wait requirements', error);
    return false;
  }
};

/* ----------------------------------------------------------------
 * Main Component
 * -------------------------------------------------------------- */

export function _Chat(props) {
  const { id, fields, kids, clip, history } = props;

  /*  Full parsed body (dialogue lines + command entries).  */
  const allEntries = kids.parsed.body;

  // Clip student is going through
  const clipRange = useMemo(() => {
    if (!clip) {
      // Default: whole doc
      return { start: 0, end: allEntries.length - 1, valid: true };
    }

    try {
      // Resolve using your PEG+process logic
      return chatUtils.clip({ body: allEntries }, clip);
    } catch (error) {
      // Return error sentinel instead of throwing
      return {
        error: true,
        message: error.message,
        clip: clip,
        start: 0,
        end: 0,
        valid: false
      };
    }
  }, [allEntries, clip]);

  // Messages before the clip
  const historyRange = useMemo(() => {
    if (!history) return null;

    try {
      return chatUtils.clip({ body: allEntries }, history);
    } catch (error) {
      // Return error sentinel instead of throwing
      return {
        error: true,
        message: error.message,
        clip: history,
        start: 0,
        end: 0,
        valid: false
      };
    }
  }, [allEntries, history]);

  // All visible messages in the window
  const windowRange = useMemo(() => {
    const start = historyRange ? Math.min(historyRange.start, clipRange.start) : clipRange.start;
    const end = clipRange.end;
    return { start, end };
  }, [clipRange, historyRange]);
  /**
   * `index` counts how many raw entries we've consumed
   * (including command entries that never appear in the UI)
   */
  const [index, setIndex] = useReduxState(
    props,
    fields.value,
    clipRange.start // start by showing the first block
  );

  // Clamp index to within the clip
  const windowedIndex = Math.max(clipRange.start, Math.min(index, clipRange.end));

  // Show only entries within current visible window
  const visibleMessages = useMemo(() => {
    return allEntries
      .slice(windowRange.start, windowedIndex + 1)
      .filter(b => b.type === 'Line');
  }, [allEntries, windowRange, windowedIndex]);

  /** Total number of dialogue lines (commands excluded) */
  const totalDialogueLines = useMemo(() => {
    return allEntries
      .slice(windowRange.start, windowRange.end + 1)
      .filter(b => b.type === 'Line').length;
  }, [allEntries, windowRange]);

  const conversationFinished = windowedIndex >= clipRange.end;

  /* ----------------------------------------------------------------
   * Advance handler
   * -------------------------------------------------------------- */
  const [isDisabled, setIsDisabled] = useState(false);
  const [sectionHeader, setSectionHeader] = useState();

  const handleAdvance = useCallback(async () => {
    let nextIndex = windowedIndex;
    let shouldBlock = false;
    while (nextIndex < windowRange.end) {
      const block = allEntries[nextIndex + 1];
      if (!block) break;
      if (block.type === 'ArrowCommand') {
        updateReduxField(props, fields.value, block.target, { id: block.source });
        nextIndex += 1;
        continue;
      }
      if (block.type === 'WaitCommand') {
        const requirements = block.requirements ?? [];
        const satisfied = await checkRequirements(props, requirements);
        if (!satisfied) {
          shouldBlock = true;
          break;
        }
        shouldBlock = false;
        nextIndex += 1;
        continue;
      }
      if (block.type === 'SectionHeader') {
        setSectionHeader(block.title);
        nextIndex += 1;
        continue
      }
      nextIndex += 1;
      if (block.type === 'Line' || block.type === 'PauseCommand') {
        break;
      }
      console.log("[Chat] WARNING: Unhandled block type");
      console.log(block);
      console.log(block.type);
    }
    setIsDisabled(shouldBlock);
    setIndex(Math.min(nextIndex, windowRange.end));
  }, [props, fields.value, windowedIndex, windowRange, allEntries, setIndex]);

  // Register advance handler for external calls
  useChatAdvanceRegistration(id, handleAdvance);

  /* ----------------------------------------------------------------
   * Footers
   * -------------------------------------------------------------- */

  const footer = conversationFinished ? (
    <InputFooter id={`${id}_footer`} disabled />
  ) : (
    <AdvanceFooter
      id={`${id}_footer`}
      onAdvance={handleAdvance}
      currentMessageIndex={visibleMessages.length}
      totalMessages={totalDialogueLines}
      disabled={isDisabled}
    />
  );

  /* ----------------------------------------------------------------
   * Render
   * -------------------------------------------------------------- */

  // Check for clip errors and render error display instead of chat
  if (clipRange.error) {
    return (
      <DisplayError
        props={props}
        name="Chat Clip Error"
        message={`Invalid clip: "${clipRange.clip}"`}
        technical={clipRange.message}
        id={`${id}_clip_error`}
      />
    );
  }

  // Check for history errors
  if (historyRange?.error) {
    return (
      <DisplayError
        props={props}
        name="Chat History Error"
        message={`Invalid history clip: "${historyRange.clip}"`}
        technical={historyRange.message}
        id={`${id}_history_error`}
      />
    );
  }

  return (
    <ChatComponent
      id={`${id}_component`}
      messages={visibleMessages}
      subtitle={sectionHeader}
      footer={footer}
      onAdvance={handleAdvance}
      height={props.height ?? 'flex-1'}
    />
  );
}

/* ----------------------------------------------------------------
 * Custom Hook for Handler Registration
 * -------------------------------------------------------------- */

export function useChatAdvanceRegistration(id, handler) {
  useEffect(() => {
    registerChatAdvanceHandler(id, handler);
    return () => unregisterChatAdvanceHandler(id, handler);
  }, [id, handler]);
}
