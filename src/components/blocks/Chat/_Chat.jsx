// src/components/blocks/Chat/_Chat.jsx
'use client';

import React, { useCallback, useMemo } from 'react';

import { useReduxState } from '@/lib/blocks';
import { ChatComponent, InputFooter, AdvanceFooter } from '@/components/common/ChatComponent';


export function _Chat(props) {
  const { id, fields, kids } = props;

  /*  Full parsed body (dialogue lines + command blocks).  */
  const allBlocks = kids.parsed.body;

  /**
   * `index` counts **how many raw blocks** we’ve consumed
   * (including command blocks that never appear in the UI).
   */
  const [index, setIndex] = useReduxState(
    props,
    fields.index,
    1 // start by showing the first block
  );

  /* ----------------------------------------------------------------
   * Derived collections
   * -------------------------------------------------------------- */

  /** Dialogue-only blocks shown in the transcript so far */
  const visibleMessages = useMemo(() => {
    return allBlocks
      .slice(0, index)
      .filter((b) => b.type !== 'CommandBlock');
  }, [allBlocks, index]);

  /** Total number of dialogue lines (commands excluded) */
  const totalDialogueLines = useMemo(() => {
    return allBlocks.filter((b) => b.type === 'Line').length;
  }, [allBlocks]);

  const conversationFinished = visibleMessages.length >= totalDialogueLines;

  /* ----------------------------------------------------------------
   * Advance handler
   * -------------------------------------------------------------- */

  const handleAdvance = useCallback(() => {
    let nextIndex = index;

    /* Walk forward until we hit the next dialogue line,
     * executing (and skipping) any intervening command blocks.
     */
    while (nextIndex < allBlocks.length) {
      const block = allBlocks[nextIndex];
      console.log(block);

      if (block.type === 'ArrowCommand') {
        alert(
          `${block.target} to ${block.source}`
        );
        nextIndex += 1; // Skip command blocks entirely
        continue;
      }

      if (block.type === 'ArrowCommand') {
        console.log("Unhandled block type");
        nextIndex += 1; // Skip command blocks entirely
        continue;
      }

      /* We’ve found a dialogue line – stop here so it becomes visible. */
      nextIndex += 1;
      break;
    }

    setIndex(Math.min(nextIndex, allBlocks.length));
  }, [index, allBlocks, setIndex]);

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
