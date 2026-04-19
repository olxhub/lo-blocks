// packages/shared/components/blocks/scenario/Chat/_Chat.tsx
'use client';

import React, { useCallback, useMemo, useEffect } from 'react';

import { useFieldState, updateField } from '@/lib/state';
import { refToReduxKey } from '@/lib/blocks/idResolver';
import { renderCompiledKids } from '@/lib/render';
import { ChatComponent, InputFooter, AdvanceFooter } from '@/components/common/ChatComponent';
import type { ChatMessage } from '@/components/common/ChatComponent';
import { DisplayError } from '@/lib/util/debug';
import { useCast, mergeCasts } from '@/lib/avatar/cast';
import type { RuntimeProps, PeggyKids, OlxReference, BlueprintKidEntry, ParentContext } from '@/lib/types';
import type { DialogueLine, EmbedCommand, ParsedConversation } from './_chatTypes';
import { useWaitConditions } from './waitConditions';

import * as chatUtils from './chatUtils';

/** Resolved clip range — indexes into the conversation body array. */
interface ClipRange {
  start: number;
  end: number;
  valid: boolean;
  message?: string | null;
  error?: boolean;
  clip?: string;
}

/* ----------------------------------------------------------------
 * Advance Handler Registry
 * -------------------------------------------------------------- */
// We keep a registry of advance handlers so other components (e.g., footers
// or keyboard shortcuts) can trigger progression without holding direct
// references to the chat component. This indirection also makes cleanup
// predictable when components unmount.
const advanceHandlers = new Map<string, () => void>();

export function registerChatAdvanceHandler(id: string, handler: () => void) {
  if (!id || typeof handler !== 'function') return;
  advanceHandlers.set(id, handler);
}

export function unregisterChatAdvanceHandler(id: string, handler: () => void) {
  if (!id) return;
  const existing = advanceHandlers.get(id);
  if (existing === handler) {
    advanceHandlers.delete(id);
  }
}

export function callChatAdvanceHandler(id: string): boolean {
  const handler = advanceHandlers.get(id);
  if (typeof handler === 'function') {
    handler();
    return true;
  }
  console.warn(`[Chat] No advance handler registered for ${id}`);
  return false;
}

/* ----------------------------------------------------------------
 * Custom Hook for Handler Registration
 * -------------------------------------------------------------- */

export function useChatAdvanceRegistration(id: string, handler: () => void) {
  useEffect(() => {
    registerChatAdvanceHandler(id, handler);
    return () => unregisterChatAdvanceHandler(id, handler);
  }, [id, handler]);
}

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
  const headerCast = parsed.header?.cast || null;
  const participants = mergeCasts(baseCast, headerCast);

  /* Validation warnings from postprocess (e.g. case-sensitivity typos). */
  const headerWarnings = parsed.headerWarnings || [];

  // Clip student is going through
  const clipRange: ClipRange = useMemo(() => {
    if (!clip) {
      // Default: whole doc
      return { start: 0, end: allEntries.length - 1, valid: true };
    }

    try {
      // Resolve using your PEG+process logic
      return chatUtils.clip({ body: allEntries }, clip);
    } catch (error: any) {
      // Return error sentinel instead of throwing
      return {
        error: true,
        message: error.message,
        clip,
        start: 0,
        end: 0,
        valid: false,
      };
    }
  }, [allEntries, clip]);

  // Messages before the clip
  const historyRange: ClipRange | null = useMemo(() => {
    if (!history) return null;

    try {
      return chatUtils.clip({ body: allEntries }, history);
    } catch (error: any) {
      // Return error sentinel instead of throwing
      return {
        error: true,
        message: error.message,
        clip: history,
        start: 0,
        end: 0,
        valid: false,
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
  const [index, setIndex] = useFieldState(
    props,
    fields.value,
    clipRange.start // start by showing the first block
  );

  // Clamp index to within the clip
  const windowedIndex = Math.max(clipRange.start, Math.min(index, clipRange.end));

  // Show only entries within current visible window.
  // Lines render as chat bubbles; EmbedCommands render as inline blocks.
  const visibleMessages: ChatMessage[] = useMemo(() => {
    const window = allEntries.slice(windowRange.start, windowedIndex + 1);
    const messages: ChatMessage[] = [];

    for (const entry of window) {
      if (entry.type === 'Line') {
        messages.push(entry);
      } else if (entry.type === 'EmbedCommand') {
        // Build parentContext from inline [key=value] metadata + parsed YAML options
        const parentContext: ParentContext = {
          ...Object.fromEntries(
            Object.entries(entry.metadata).map(([k, v]) => [k, v])
          ),
          ...(entry.parsedOptions as Record<string, string> | undefined),
        };

        const blockRef: BlueprintKidEntry = {
          type: 'block',
          id: entry.ref as OlxReference,
          ...(Object.keys(parentContext).length > 0 ? { parentContext } : {}),
        };

        const rendered = renderCompiledKids({
          kids: [blockRef],
          nodeInfo: props.nodeInfo,
          runtime: props.runtime,
        });

        messages.push({
          type: 'Element',
          element: <>{rendered}</>,
        });
      }
    }
    return messages;
  }, [allEntries, windowRange, windowedIndex, props.nodeInfo, props.runtime]);

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
  const { canAdvance, isWaitSatisfied } = useWaitConditions(props, allEntries, windowedIndex, windowRange.end);

  /* ----------------------------------------------------------------
   * Advance handler
   * -------------------------------------------------------------- */
  const [sectionHeader, setSectionHeader] = useFieldState(props, fields.sectionHeader);

  const isDisabled = !canAdvance;

  const handleAdvance = useCallback(() => {
    if (!canAdvance) return;

    let nextIndex = windowedIndex;
    while (nextIndex < windowRange.end) {
      const block = allEntries[nextIndex + 1];
      if (!block) break;

      switch (block.type) {
        case 'ArrowCommand':
          updateField(props, fields.value, block.target, { reduxKey: refToReduxKey({ ...props, id: block.source as any }) });
          nextIndex += 1;
          continue;

        case 'WaitCommand':
          if (!isWaitSatisfied(block)) {
            // Unsatisfied wait - stop here, user must wait for condition
            setIndex(Math.min(nextIndex, windowRange.end));
            return;
          }
          // Satisfied - skip past it
          nextIndex += 1;
          continue;

        case 'SectionHeader':
          setSectionHeader(block.title);
          nextIndex += 1;
          continue;

        case 'Line':
        case 'PauseCommand':
          nextIndex += 1;
          setIndex(Math.min(nextIndex, windowRange.end));
          return;

        case 'EmbedCommand':
          // Rendered as ElementEntry in visibleMessages via renderCompiledKids
          nextIndex += 1;
          setIndex(Math.min(nextIndex, windowRange.end));
          return;

        case 'EmbedBlock':
          // TODO: inline OLX parsing via storeEntry in postprocess
          console.warn('[Chat] EmbedBlock (inline OLX) not yet supported:', block.content?.slice(0, 80));
          nextIndex += 1;
          continue;

        default:
          console.warn('[Chat] Unhandled entry type:', block.type, block);
          nextIndex += 1;
          break;
      }
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
        onAdvance={handleAdvance}
        height={props.height ?? 'flex-1'}
      />
    </>
  );
}
