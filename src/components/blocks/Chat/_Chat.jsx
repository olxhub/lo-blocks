// src/components/blocks/Chat/_Chat.jsx
'use client';

import React, { useCallback, useMemo } from 'react';

import { useReduxState } from '@/lib/blocks';
import { ChatComponent, InputFooter, AdvanceFooter } from '@/components/common/ChatComponent';


export function _Chat(props) {
  const { id, fields, kids } = props;

  /*  Full parsed body (dialogue lines + command entries).  */
  const allEntries = kids.parsed.body;

  /**
   * `index` counts **how many raw entries** we’ve consumed
   * (including command entries that never appear in the UI).
   */
  const [index, setIndex] = useReduxState(
    props,
    fields.index,
    1 // start by showing the first block
  );

  /* ----------------------------------------------------------------
   * Derived collections
   * -------------------------------------------------------------- */

  /** Dialogue-only entries shown in the transcript so far */
  const visibleMessages = useMemo(() => {
    return allEntries
      .slice(0, index)
      .filter((b) => b.type === 'Line');
  }, [allEntries, index]);

  /** Total number of dialogue lines (commands excluded) */
  const totalDialogueLines = useMemo(() => {
    return allEntries.filter((b) => b.type === 'Line').length;
  }, [allEntries]);

  const conversationFinished = visibleMessages.length >= totalDialogueLines;

  /* ----------------------------------------------------------------
   * Advance handler
   * -------------------------------------------------------------- */

  const handleAdvance = useCallback(() => {
    let nextIndex = index;

    /* Walk forward until we hit the next dialogue line,
     * executing (and skipping) any intervening command entries.
     */
    while (nextIndex < allEntries.length) {
      const block = allEntries[nextIndex];
      console.log(block);

      if (block.type === 'ArrowCommand') {
        alert(
          `${block.target} to ${block.source}`
        );
        nextIndex += 1; // Skip command entries entirely
        continue;
      }

      if (block.type === 'ArrowCommand') {
        console.log("Unhandled block type");
        nextIndex += 1; // Skip command entries entirely
        continue;
      }

      nextIndex += 1;

      if (block.type === "Line" || block.type === "PauseCommand") {
        break;
      }
      console.log("[Chat] WARNING: Unhandled block type");
      console.log(block);
      console.log(block.type);
    }

    setIndex(Math.min(nextIndex, allEntries.length));
  }, [index, allEntries, setIndex]);

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

  return (
    <ChatComponent
      id={`${id}_component`}
      messages={visibleMessages}
      footer={footer}
      onAdvance={handleAdvance}
    />
  );
}
