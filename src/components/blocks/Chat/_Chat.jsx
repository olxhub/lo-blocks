// src/components/blocks/Chat/_Chat.jsx
'use client';

import React, { useCallback, useMemo } from 'react';

import { useReduxState, updateReduxField } from '@/lib/state';
import { ChatComponent, InputFooter, AdvanceFooter } from '@/components/common/ChatComponent';
import { DisplayError } from '@/lib/util/debug';

import * as chatUtils from './chatUtils';

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
   * `index` counts **how many raw entries** we’ve consumed
   * (including command entries that never appear in the UI).
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

  const handleAdvance = useCallback(() => {
    let nextIndex = windowedIndex;
    while (nextIndex < windowRange.end) {
      const block = allEntries[nextIndex + 1];
      if (!block) break;
      if (block.type === 'ArrowCommand') {
        updateReduxField(props, fields.value, block.target, { id: block.source });
        nextIndex += 1;
        continue;
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
    // fields.value and props intentionally omitted: would cause excessive re-creations, so we need
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowedIndex, windowRange, allEntries, setIndex]);

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
      footer={footer}
      onAdvance={handleAdvance}
      height={props.height ?? 'flex-1'}
    />
  );
}
