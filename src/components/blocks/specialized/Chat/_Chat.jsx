// src/components/blocks/Chat/_Chat.jsx
'use client';

import React, { useCallback, useMemo, useEffect } from 'react';

import { useReduxState, updateReduxField } from '@/lib/state';
import { ChatComponent, InputFooter, AdvanceFooter } from '@/components/common/ChatComponent';
import { DisplayError } from '@/lib/util/debug';
import { useWaitConditions } from './waitConditions';

import * as chatUtils from './chatUtils';

/* ----------------------------------------------------------------
 * Advance Handler Registry
 * -------------------------------------------------------------- */
// We keep a registry of advance handlers so other components (e.g., footers
// or keyboard shortcuts) can trigger progression without holding direct
// references to the chat component. This indirection also makes cleanup
// predictable when components unmount.
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
   * Wait conditions - check if we can advance past any wait commands
   * -------------------------------------------------------------- */
  const { canAdvance, isWaitSatisfied } = useWaitConditions(props, allEntries, windowedIndex, windowRange.end);

  /* ----------------------------------------------------------------
   * Advance handler
   * -------------------------------------------------------------- */
  const [sectionHeader, setSectionHeader] = useReduxState(props, fields.sectionHeader);

  const isDisabled = !canAdvance;

  const handleAdvance = useCallback(() => {
    if (!canAdvance) return;

    let nextIndex = windowedIndex;
    while (nextIndex < windowRange.end) {
      const block = allEntries[nextIndex + 1];
      if (!block) break;
      if (block.type === 'ArrowCommand') {
        updateReduxField(props, fields.value, block.target, { id: block.source });
        nextIndex += 1;
        continue;
      }
      if (block.type === 'WaitCommand') {
        if (!isWaitSatisfied(block)) {
          // Unsatisfied wait - stop here, user must wait for condition
          break;
        }
        // Satisfied - skip past it
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
    setIndex(Math.min(nextIndex, windowRange.end));
  }, [canAdvance, isWaitSatisfied, props, fields.value, windowedIndex, windowRange, allEntries, setIndex, setSectionHeader]);

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
// Convenience hook to register/unregister an advance handler alongside the
// component lifecycle so callers don't have to manage the registry directly.

export function useChatAdvanceRegistration(id, handler) {
  useEffect(() => {
    registerChatAdvanceHandler(id, handler);
    return () => unregisterChatAdvanceHandler(id, handler);
  }, [id, handler]);
}
