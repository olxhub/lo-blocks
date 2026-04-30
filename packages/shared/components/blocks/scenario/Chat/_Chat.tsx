// packages/shared/components/blocks/scenario/Chat/_Chat.tsx
'use client';

import React, { useCallback, useMemo } from 'react';

import { useFieldState } from '@/lib/state';
import { useRenderedBlocksMultiple } from '@/lib/blocks/useRenderedBlock';
import { advanceFrom } from '@/lib/advance';
import { ChatComponent, InputFooter, AdvanceFooter } from '@/components/common/ChatComponent';
import type { ChatMessage } from '@/components/common/ChatComponent';
import { DisplayError } from '@/lib/util/debug';
import { useCast, mergeCasts } from '@/lib/avatar/cast';
import type { RuntimeProps, PeggyKids, OlxReference } from '@/lib/types';
import type { ParsedConversation } from './_chatTypes';
import { useWaitConditions } from './waitConditions';

import * as chatUtils from './chatUtils';
import type { ClipResolution } from './chatUtils';

/* ----------------------------------------------------------------
 * Main Component
 * -------------------------------------------------------------- */

export function _Chat(props: RuntimeProps) {
  const { id, fields, kids, clip, history } = props;

  const parsed = (kids as unknown as PeggyKids<ParsedConversation>).parsed;

  /*  Full parsed body (dialogue lines + command entries).  */
  const allEntries = parsed.body;

  /* Cast: merge runtime cast → cast= attribute → chatpeg header cast.
   * Most specific (header) wins. */
  const baseCast = useCast(props);
  const headerCast = parsed.header?.cast ?? null;
  const participants = mergeCasts(baseCast, headerCast);

  /* Validation warnings from postprocess (e.g. case-sensitivity typos). */
  const headerWarnings = parsed.headerWarnings || [];

  // Clip student is going through
  const clipRange: ClipResolution = useMemo(() => {
    if (!clip) {
      return { start: 0, end: allEntries.length - 1, valid: true, message: null } as const;
    }

    try {
      return chatUtils.clip({ body: allEntries }, clip);
    } catch (error: any) {
      return {
        error: true as const,
        message: error.message,
        clip,
        start: 0,
        end: 0,
        valid: false as const,
      };
    }
  }, [allEntries, clip]);

  // Messages before the clip
  const historyRange: ClipResolution | null = useMemo(() => {
    if (!history) return null;

    try {
      return chatUtils.clip({ body: allEntries }, history);
    } catch (error: any) {
      return {
        error: true as const,
        message: error.message,
        clip: history,
        start: 0,
        end: 0,
        valid: false as const,
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
  const [index] = useFieldState(
    props,
    fields.value,
    clipRange.start // start by showing the first block
  );

  // Clamp index to within the clip
  const windowedIndex = Math.max(clipRange.start, Math.min(index, clipRange.end));

  // Collect all embedded block IDs from the visible window
  const embedIds = useMemo(() => {
    const window = allEntries.slice(windowRange.start, windowedIndex + 1);
    const ids: OlxReference[] = [];
    for (const entry of window) {
      if (entry.type === 'EmbedCommand') {
        ids.push(entry.ref as OlxReference);
      }
    }
    return ids;
  }, [allEntries, windowRange, windowedIndex]);

  // Use lazy-loading hook to render all embedded blocks
  const { blocks: renderedBlocks } = useRenderedBlocksMultiple(props, embedIds);

  // Build visible messages, mapping EmbedCommands to their rendered blocks
  const visibleMessages: ChatMessage[] = useMemo(() => {
    const window = allEntries.slice(windowRange.start, windowedIndex + 1);
    const messages: ChatMessage[] = [];
    let embedIndex = 0;

    for (const entry of window) {
      if (entry.type === 'Line') {
        messages.push(entry);
      } else if (entry.type === 'EmbedCommand') {
        messages.push({
          type: 'Element',
          element: renderedBlocks[embedIndex++],
        });
      }
    }
    return messages;
  }, [allEntries, windowRange, windowedIndex, renderedBlocks]);

  /** Total number of visible entries (lines + embeds; commands excluded) */
  const totalDialogueLines = useMemo(() => {
    return allEntries
      .slice(windowRange.start, windowRange.end + 1)
      .filter(b => b.type === 'Line' || b.type === 'EmbedCommand').length;
  }, [allEntries, windowRange]);

  const conversationFinished = windowedIndex >= clipRange.end;

  /* ----------------------------------------------------------------
   * Wait conditions - check if we can advance past any wait commands
   * -------------------------------------------------------------- */
  const { canAdvance } = useWaitConditions(props, allEntries, windowedIndex, windowRange.end);

  /* ----------------------------------------------------------------
   * Advance handler — delegates to the blueprint advance function
   * via advanceFrom, which is the same path the global spacebar uses.
   * -------------------------------------------------------------- */
  const [sectionHeader] = useFieldState(props, fields.sectionHeader);

  const isDisabled = !canAdvance;

  const handleAdvance = useCallback(() => {
    const state = props.runtime.store.getState();
    advanceFrom(props.nodeInfo, state);
  }, [props.nodeInfo, props.runtime.store]);

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
  if (!clipRange.valid) {
    return (
      <DisplayError
        props={props}
        title="Chat Clip Error"
        message={`Invalid clip: "${clipRange.clip}"`}
        technical={clipRange.message}
        id={`${id}_clip_error`}
      />
    );
  }

  // Check for history errors
  if (historyRange && !historyRange.valid) {
    return (
      <DisplayError
        props={props}
        title="Chat History Error"
        message={`Invalid history clip: "${historyRange.clip}"`}
        technical={historyRange.message}
        id={`${id}_history_error`}
      />
    );
  }

  return (
    <>
      {headerWarnings.length > 0 && (
        <div className="bg-warning-subtle text-warning text-sm p-2 rounded border border-warning mb-2">
          <strong>Chat header warnings:</strong>
          <ul className="list-disc ml-4 mt-1">
            {headerWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      <ChatComponent
        id={`${id}_component`}
        messages={visibleMessages}
        participants={participants}
        subtitle={sectionHeader}
        footer={footer}
        height={props.height ?? 'flex-1'}
      />
    </>
  );
}
