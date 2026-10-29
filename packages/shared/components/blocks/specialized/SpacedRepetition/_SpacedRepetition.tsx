// packages/shared/components/blocks/specialized/SpacedRepetition/_SpacedRepetition.tsx
//
// Shows one due card at a time. Each presentation renders the child under a
// fresh scope (`deck:card:#rep_N`) so it starts blank; the first graded result
// of that presentation is recorded with the scheduler. Date.now() is read
// only in effects and handlers.
'use client';
import type { RuntimeProps } from '@/lib/types';
import type { BlockReference } from '@/lib/types/core';

import React, { useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useFieldState } from '@/lib/state';
import { useKids } from '@/lib/player/client/render';
import { useGradingState } from '@/lib/grading';
import { correctness } from '@/lib/blocks';
import { addScope, extendIdPrefix, scopeMarker, splitNs } from '@/lib/types/id-grammar';
import { assertKidArray } from '@/lib/types/kids';
import { staticEntry, blueprintFor } from '@/lib/blocks/staticDom';
import { DisplayError } from '@/lib/util/debug';
import { useBlockTranslation } from '@/lib/i18n/blockI18n';
import NavArrow from '@/components/common/NavArrow';
import { SCHEDULERS } from './schedulers';
import type { ReviewResult } from './schedulers';
import { reconcileCards, selectNext, selectSoonest, countDue, recordReview } from './deck';
import type { Cards, Current } from './deck';

// setTimeout's ceiling (~24.8 days).
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

function resultOf(value: string): ReviewResult | null {
  if (value === correctness.correct) return 'correct';
  if (value === correctness.incorrect || value === correctness.partiallyCorrect) return 'incorrect';
  return null;
}

function CardPresentation({ props, kid, cardKey, current, onResult, focusRef }: {
  props: RuntimeProps;
  kid: BlockReference;
  cardKey: string;
  current: Current;
  onResult: (result: ReviewResult) => void;
  focusRef: React.MutableRefObject<boolean>;
}) {
  const { idPrefix } = extendIdPrefix(props, [props.id, cardKey, scopeMarker('rep_' + current.rep)]);
  // FIXME: Should not spread runtime like this - need proper scoped runtime factory
  const scopedProps = { ...props, idPrefix, runtime: { ...props.runtime, idPrefix } };

  const { kids } = useKids({ ...scopedProps, kids: [kid] });
  const graded = useGradingState(scopedProps, addScope(kid.definitionKey, idPrefix)).correct;

  // Stored `current.result` makes recording idempotent across remounts; the
  // ref covers the gap before that write folds back into the store.
  const recordedRef = useRef(false);
  useEffect(() => {
    if (props.runtime.sideEffectFree || recordedRef.current || current.result !== null) return;
    const result = resultOf(graded);
    if (result === null) return;
    recordedRef.current = true;
    onResult(result);
  }, [graded, current.result, onResult, props.runtime.sideEffectFree]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!focusRef.current || !containerRef.current) return;
    focusRef.current = false;
    containerRef.current.focus();
  }, [focusRef]);

  return (
    <div className="lo-spaced-repetition__card" ref={containerRef} tabIndex={-1}>
      {kids}
    </div>
  );
}

export default function SpacedRepetition(props: RuntimeProps) {
  const { id, fields, algorithm, boxes, baseInterval } = props;
  const { t } = useBlockTranslation(props);
  const sideEffectFree = props.runtime.sideEffectFree;

  assertKidArray(props.kids);
  const cardKids = props.kids.filter((kid): kid is BlockReference => kid.type === 'block');
  const keys = cardKids.map(kid => splitNs(kid.definitionKey).path as string);
  const keysSignature = keys.join('\n');
  const duplicate = keys.find((key, i) => keys.indexOf(key) !== i);
  const notCards = useSelector((state: unknown) => keys.filter((key, i) => {
    const entry = staticEntry(state, props, cardKids[i].definitionKey);
    return entry && (!blueprintFor(props, entry)?.isGrader || entry.attributes.when);
  }).map(key => `"${key}"`).join(', '));
  const error = keys.length === 0 ? 'SpacedRepetition has no cards'
    : duplicate ? `Two cards share the id "${duplicate}"`
    : notCards ? `Not usable as cards: ${notCards}` : null;

  const scheduler = useMemo(
    () => SCHEDULERS[algorithm]({ boxes, baseInterval }),
    [algorithm, boxes, baseInterval],
  );

  const [cards, setCards] = useFieldState(props, fields.cards, null) as [Cards | null, (v: Cards) => void];
  const [current, setCurrent] = useFieldState(props, fields.current, null) as [Current | null, (v: Current) => void];
  const focusRef = useRef(false);
  const studyAheadRef = useRef<HTMLButtonElement | null>(null);

  const present = (cardKey: string | null, now: number) => {
    const rep = current === null ? 0 : current.rep + (cardKey === null ? 0 : 1);
    setCurrent({ cardKey, rep, result: null, at: now });
  };

  // Keep schedules in sync with the authored cards; pick a card if none is on screen.
  useEffect(() => {
    if (sideEffectFree || error) return;
    const now = Date.now();
    const { cards: deck, changed } = reconcileCards(cards, keys, scheduler, now);
    if (changed) setCards(deck);
    const stale = current === null || (current.cardKey !== null && !keys.includes(current.cardKey));
    if (stale) present(selectNext(deck, keys, scheduler, now), now);
    // keysSignature stands in for keys, which is a new array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysSignature, cards, current, scheduler, sideEffectFree, error]);

  // While idle, wake up when the soonest card falls due.
  useEffect(() => {
    if (sideEffectFree || cards === null || current === null || current.cardKey !== null) return;
    const soonest = selectSoonest(cards, keys, scheduler);
    if (soonest === null) return;
    const wait = Math.min(Math.max(0, scheduler.dueAt(cards[soonest].state) - Date.now()), MAX_TIMEOUT_MS);
    // A wait capped at the ceiling may find nothing due; presenting null re-arms.
    const timer = setTimeout(() => {
      const now = Date.now();
      present(selectNext(cards, keys, scheduler, now), now);
    }, wait);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysSignature, cards, current, scheduler, sideEffectFree]);

  // Going idle from Next card moves focus to Study ahead.
  useEffect(() => {
    if (!focusRef.current || !studyAheadRef.current) return;
    focusRef.current = false;
    studyAheadRef.current.focus();
  }, [current]);

  if (error) {
    return (
      <DisplayError
        props={props}
        title="SpacedRepetition"
        message={error}
        technical={{ hint: 'Each child is one card: a problem (e.g. <CapaProblem>) with its own id and no when=.', blockId: id }}
        id={`${id}_bad_cards`}
      />
    );
  }

  const formatWhen = (ms: number) =>
    new Intl.DateTimeFormat(props.runtime.locale.code, { dateStyle: 'medium', timeStyle: 'short' }).format(ms);

  if (cards === null || current === null || !keys.every(key => key in cards)
    || (current.cardKey !== null && !keys.includes(current.cardKey))) {
    return <div className="lo-spaced-repetition"><p className="lo-spaced-repetition__status">{t('preparingCards')}</p></div>;
  }

  const handleNext = () => {
    focusRef.current = true;
    const now = Date.now();
    present(selectNext(cards, keys, scheduler, now), now);
  };

  const handleStudyAhead = () => {
    focusRef.current = true;
    const now = Date.now();
    present(selectSoonest(cards, keys, scheduler), now);
  };

  const status = (
    <p className="lo-spaced-repetition__status">
      {t('cardsDue', { due: countDue(cards, keys, scheduler, current.at), count: keys.length })}
    </p>
  );

  if (current.cardKey === null) {
    const soonest = selectSoonest(cards, keys, scheduler);
    return (
      <section className="lo-spaced-repetition" aria-label={t('flashcardDeck')}>
        {status}
        <div className="lo-spaced-repetition__idle">
          <p>{t('nothingDue')}</p>
          {soonest !== null && <p>{t('nextDueAt', { when: formatWhen(scheduler.dueAt(cards[soonest].state)) })}</p>}
          <button type="button" className="lo-spaced-repetition__button" onClick={handleStudyAhead} ref={studyAheadRef}
            aria-label={t('studyAheadLabel')}>
            {t('studyAhead')}
          </button>
        </div>
      </section>
    );
  }

  const cardKey = current.cardKey;
  const kid = cardKids[keys.indexOf(cardKey)];

  const handleResult = (result: ReviewResult) => {
    const now = Date.now();
    setCards(recordReview(cards, cardKey, scheduler, result, now));
    setCurrent({ ...current, result });
  };

  return (
    <section className="lo-spaced-repetition" aria-label={t('flashcardDeck')}>
      {status}
      <CardPresentation
        key={`${cardKey}:${current.rep}`}
        props={props}
        kid={kid}
        cardKey={cardKey}
        current={current}
        onResult={handleResult}
        focusRef={focusRef}
      />
      <div className="lo-spaced-repetition__footer" aria-live="polite">
        {current.result !== null && (
          <>
            <p className={`lo-spaced-repetition__feedback lo-spaced-repetition__feedback--${current.result}`}>
              {t(current.result === 'correct' ? 'reviewCorrect' : 'reviewIncorrect',
                { when: formatWhen(scheduler.dueAt(cards[cardKey].state)) })}
            </p>
            <button type="button" className="lo-spaced-repetition__button" onClick={handleNext}
              aria-label={t('nextCardLabel')}>
              {t('nextCard')}
              <NavArrow direction="forward" className="lo-spaced-repetition__arrow" />
            </button>
          </>
        )}
      </div>
    </section>
  );
}
