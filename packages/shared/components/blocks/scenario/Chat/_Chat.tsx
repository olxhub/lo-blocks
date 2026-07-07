// packages/shared/components/blocks/scenario/Chat/_Chat.tsx
'use client';

import React, { useCallback, useMemo } from 'react';

import { useFieldState, settings } from '@/lib/state';
import { useRenderedBlocksMultiple } from '@/lib/blocks/useRenderedBlock';
import { advanceFrom } from '@/lib/advance';
import { ChatComponent, InputFooter, AdvanceFooter } from '@/components/common/ChatComponent';
import type { ChatDisplayEntry } from '@/lib/types';
import { DisplayError } from '@/lib/util/debug';
import { useCast, mergeCasts } from '@/lib/avatar/cast';
import type { RuntimeProps, PeggyKids, DefinitionRef } from '@/lib/types';
import type { ParsedConversation } from './_chatTypes';
import { useWaitConditions, interludeExitAllowed } from './waitConditions';
import { useLlmInterlude } from './llmInterlude';

import * as chatUtils from './chatUtils';
import type { ClipResolution } from './chatUtils';

/* ----------------------------------------------------------------
 * Main Component
 * -------------------------------------------------------------- */

export default function Chat(props: RuntimeProps) {
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
    const ids: DefinitionRef[] = [];
    for (const entry of window) {
      if (entry.type === 'EmbedCommand') {
        ids.push(entry.ref as DefinitionRef);
      }
    }
    return ids;
  }, [allEntries, windowRange, windowedIndex]);

  // Use lazy-loading hook to render all embedded blocks
  const { blocks: renderedBlocks } = useRenderedBlocksMultiple(props, embedIds);

  // Build visible messages, mapping EmbedCommands to their rendered blocks
  // TODO: The embedIndex counter assumes embedIds and visibleMessages iterate the same window
  // with the same filter logic. A Map<DefinitionRef, ReactNode> keyed by entry.ref would be
  // more robust against dependency/closure mismatches, at the cost of a bit more memory.
  /* LLM interludes (>>> llm): runtime turns live in the `messages` log
   * field, keyed by the body index of their interlude. The script transcript
   * stays derived; interlude turns splice in at their interlude's position. */
  const interlude = useLlmInterlude(props, allEntries, windowedIndex);

  const visibleMessages: ChatDisplayEntry[] = useMemo(() => {
    const window = allEntries.slice(windowRange.start, windowedIndex + 1);
    const messages: ChatDisplayEntry[] = [];
    let embedIndex = 0;

    for (let i = 0; i < window.length; i++) {
      const entry = window[i];
      const bodyIndex = windowRange.start + i;
      if (entry.type === 'Line') {
        messages.push(entry);
      } else if (entry.type === 'EmbedCommand') {
        messages.push({
          type: 'Element',
          element: renderedBlocks[embedIndex++],
        });
      } else if (entry.type === 'LlmCommand') {
        for (const item of interlude.logItems) {
          if (item.atIndex === bodyIndex) messages.push(item.message);
        }
      }
    }
    return messages;
  }, [allEntries, windowRange, windowedIndex, renderedBlocks, interlude.logItems]);

  /** Total number of visible entries (lines + embeds; commands excluded) */
  const totalDialogueLines = useMemo(() => {
    return allEntries
      .slice(windowRange.start, windowRange.end + 1)
      .filter(b => b.type === 'Line' || b.type === 'EmbedCommand').length;
  }, [allEntries, windowRange]);

  /** Script-derived entries shown so far — the "N" in "N of M". Interlude
   *  turns are live conversation, not script progress, so they don't count. */
  const scriptMessagesShown = useMemo(() => {
    return allEntries
      .slice(windowRange.start, windowedIndex + 1)
      .filter(b => b.type === 'Line' || b.type === 'EmbedCommand').length;
  }, [allEntries, windowRange, windowedIndex]);

  const conversationFinished = windowedIndex >= clipRange.end;

  /* ----------------------------------------------------------------
   * Wait conditions - check if we can advance past any wait commands
   * -------------------------------------------------------------- */
  const { canAdvance, context: waitContext } = useWaitConditions(props, allEntries, windowedIndex, windowRange.end);

  /* ----------------------------------------------------------------
   * Advance handler — delegates to the blueprint advance function
   * via advanceFrom, which is the same path the global spacebar uses.
   * -------------------------------------------------------------- */
  const [sectionHeader] = useFieldState(props, fields.sectionHeader);

  /* ----------------------------------------------------------------
   * Instructor mode — ignore waits and autoadvance for content review.
   * The ignore-waits toggle is a component field read by advance()
   * so it works for both button clicks and spacebar.
   * -------------------------------------------------------------- */
  const [instructorMode] = useFieldState(null, settings.instructorMode, false);
  const [ignoreWaits, setIgnoreWaits] = useFieldState(props, fields.ignoreWaits, false);

  // Parked on an interlude, "Continue" is the exit gate: until satisfied,
  // agent ended it, or maxTurns exhausted (see interludeExitAllowed).
  const interludeCanExit = interlude.active
    ? interludeExitAllowed(interlude.active, waitContext, interlude.logItems, interlude.activeIndex)
    : true;
  const isDisabled = (interlude.active ? !interludeCanExit : !canAdvance)
    && !(instructorMode && ignoreWaits);

  const handleAdvance = useCallback(() => {
    advanceFrom(props.nodeInfo, props.runtime.store.getState());
  }, [props.nodeInfo, props.runtime.store]);

  const handleAutoadvance = useCallback(() => {
    props.locals.autoadvance(props);
  }, [props]);

  /* ----------------------------------------------------------------
   * Footers
   * -------------------------------------------------------------- */

  const interludeSendDisabled = interlude.busy || interlude.ended
    || (interlude.maxTurns !== null && interlude.turnsUsed >= interlude.maxTurns);

  // Order matters: a script can END on an interlude (a pure-LLM chat is a
  // single >>> llm entry), so "parked on an interlude" wins over "finished".
  const footer = interlude.active ? (
    // Open floor: talk to the LLM participant; Continue (when the exit
    // gate allows) resumes the script.
    <>
      {!isDisabled && (
        <AdvanceFooter
          id={`${id}_advance`}
          onAdvance={handleAdvance}
          currentMessageIndex={scriptMessagesShown}
          totalMessages={totalDialogueLines}
        />
      )}
      <InputFooter
        id={`${id}_footer`}
        onSendMessage={(text) => { void interlude.sendMessage(text); }}
        disabled={interludeSendDisabled}
        placeholder={
          interlude.ended ? 'Conversation ended — press Continue'
            : interlude.busy ? `${interlude.active.participant} is thinking…`
              : `Message ${interlude.active.participant}…`
        }
      />
    </>
  ) : conversationFinished ? (
    <InputFooter id={`${id}_footer`} disabled />
  ) : (
    <AdvanceFooter
      id={`${id}_footer`}
      onAdvance={handleAdvance}
      currentMessageIndex={scriptMessagesShown}
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

  const instructorToolbar = instructorMode && !conversationFinished ? (
    <div className="bg-warning-subtle text-sm px-3 py-2 border border-warning rounded-t flex items-center gap-3">
      <span className="font-semibold text-warning uppercase tracking-wide text-xs">Instructor</span>
      <label className="flex items-center gap-1 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={ignoreWaits}
          onChange={e => setIgnoreWaits(e.target.checked)}
        />
        Ignore waits
      </label>
      <button
        onClick={handleAutoadvance}
        className="text-xs bg-accent text-inverse px-3 py-1 rounded hover:opacity-80"
      >
        Autoadvance
      </button>
    </div>
  ) : null;

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
      {instructorToolbar}
      <ChatComponent
        id={`${id}_component`}
        messages={visibleMessages}
        ns={props.runtime.ns}
        participants={participants}
        subtitle={sectionHeader}
        footer={footer}
        height={props.height ?? 'flex-1'}
      />
    </>
  );
}
