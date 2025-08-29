// src/components/blocks/TextHighlight/_TextHighlight.jsx
'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useReduxState } from '@/lib/state';

export default function _TextHighlight(props) {
  const { kids = {}, mode = 'immediate', showRealtimeFeedback = false } = props;

  // Parse the content from kids
  const parsed = useMemo(() => {
    if (kids.parsed) return kids.parsed;
    if (kids.prompt && kids.segments) return kids;

    return {
      prompt: 'Content Error: Unable to parse TextHighlight content',
      segments: [],
      scoring: [],
      targetedFeedback: {},
      error: true
    };
  }, [kids]);

  // Convert parsed segments to word tokens with metadata
  const wordData = useMemo(() => {
    if (!parsed.segments || parsed.segments.length === 0) {
      return [];
    }

    const words = [];
    let wordIndex = 0;

    parsed.segments.forEach((segment, segmentIndex) => {
      const text = segment.content;
      const segmentWords = text.split(/(\s+)/);

      segmentWords.forEach((word) => {
        if (word.trim()) {
          words.push({
            index: wordIndex++,
            text: word,
            segmentIndex,
            segmentType: segment.type,
            segmentId: segment.id,
            isRequired: segment.type === 'required',
            isOptional: segment.type === 'optional',
            isFeedbackTrigger: segment.type === 'feedback_trigger'
          });
        } else if (word) {
          words.push({ index: -1, text: word, isSpace: true });
        }
      });
    });

    return words;
  }, [parsed.segments]);

  // Redux state management - store as array, work with as Set
  const [selectedArray, setSelectedArray] = useReduxState(props, props.fields.value, []);
  const selectedIndices = new Set(selectedArray || []);
  const setSelectedIndices = (newSet) => setSelectedArray(Array.from(newSet));

  const [attempts, setAttempts] = useReduxState(props, props.fields.attempts, 0);
  const [feedback, setFeedback] = useReduxState(props, props.fields.feedback, '');
  const [showAnswer, setShowAnswer] = useReduxState(props, props.fields.showAnswer, false);
  const [checked, setChecked] = useReduxState(props, props.fields.checked, false);

  // Refs for DOM and drag state (no useState per spec)
  const containerRef = useRef(null);
  const wordRefs = useRef(new Map()); // index -> HTMLElement
  const wordRects = useRef(new Map()); // index -> DOMRect
  const dragging = useRef(false);
  const dragStartPoint = useRef({ x: 0, y: 0 });
  const dragCurrentPoint = useRef({ x: 0, y: 0 });
  const selectionAtDragStart = useRef(new Set());
  const paintSelect = useRef(true); // true: add, false: remove

  // Calculate correct answers
  const correctIndices = useMemo(() => {
    const correct = new Set();
    wordData.forEach((word) => {
      if (word.index >= 0 && (word.isRequired || word.isOptional)) {
        correct.add(word.index);
      }
    });
    return correct;
  }, [wordData]);

  const requiredIndices = useMemo(() => {
    const required = new Set();
    wordData.forEach((word) => {
      if (word.index >= 0 && word.isRequired) {
        required.add(word.index);
      }
    });
    return required;
  }, [wordData]);

  // Build content-defined selection groups based on adjacency of required/optional tokens
  const groups = useMemo(() => {
    const result = [];
    let current = null;
    for (const w of wordData) {
      if (w.isSpace) { continue; }
      const isTarget = w.isRequired || w.isOptional;
      if (isTarget) {
        if (!current) current = { tokenIndices: [], required: new Set(), optional: new Set() };
        current.tokenIndices.push(w.index);
        if (w.isRequired) current.required.add(w.index); else current.optional.add(w.index);
      } else {
        if (current) { result.push(current); current = null; }
      }
    }
    if (current) result.push(current);
    // Build a lookup from token index -> group for styling decisions
    const byToken = new Map();
    result.forEach((g) => g.tokenIndices.forEach((idx) => byToken.set(idx, g)));
    return Object.assign([], result, { byToken });
  }, [wordData]);

  // Calculate selection statistics at the segment level
  const stats = useMemo(() => {
    // Correct segments: groups where all required tokens are selected
    let correctSegments = 0;
    for (const g of groups) {
      let allReqSelected = true;
      for (const idx of g.required) {
        if (!selectedIndices.has(idx)) { allReqSelected = false; break; }
      }
      if (allReqSelected) correctSegments += 1;
    }

    // Incorrect selections: contiguous runs of selected neutral tokens
    let incorrectSegments = 0;
    let inRun = false;
    for (const w of wordData) {
      if (w.index < 0) continue;
      const isNeutral = !w.isRequired && !w.isOptional;
      if (isNeutral && selectedIndices.has(w.index)) {
        if (!inRun) { incorrectSegments += 1; inRun = true; }
      } else {
        inRun = false;
      }
    }

    const totalSegments = groups.length;
    const isComplete = correctSegments === totalSegments && incorrectSegments === 0;
    return { correctSegments, incorrectSegments, totalSegments, isComplete };
  }, [groups, wordData, selectedIndices]);

  // Immediate feedback updater
  const updateImmediateFeedback = (selectionSet) => {
    const temp = new Set(selectionSet);
    let correctSegments = 0;
    for (const g of groups) {
      let allReqSelected = true;
      for (const idx of g.required) {
        if (!temp.has(idx)) { allReqSelected = false; break; }
      }
      if (allReqSelected) correctSegments += 1;
    }
    let incorrectSegments = 0;
    let inRun = false;
    for (const w of wordData) {
      if (w.index < 0) continue;
      const isNeutral = !w.isRequired && !w.isOptional;
      if (isNeutral && temp.has(w.index)) {
        if (!inRun) { incorrectSegments += 1; inRun = true; }
      } else {
        inRun = false;
      }
    }
    if (correctSegments === groups.length && incorrectSegments === 0) {
      setFeedback('Perfect! You selected all target segments.');
    } else if (incorrectSegments > 0) {
      setFeedback(`${correctSegments}/${groups.length} correct • ${incorrectSegments} errors`);
    } else {
      setFeedback(`${correctSegments}/${groups.length} correct`);
    }
  };

  // Helpers for drag selection based on rectangle overlap (>= 50% area considered "mostly selected")
  const computeWordRects = () => {
    wordRects.current.clear();
    wordRefs.current.forEach((el, idx) => {
      if (el && typeof idx === 'number' && idx >= 0) {
        wordRects.current.set(idx, el.getBoundingClientRect());
      }
    });
  };

  const getDragRect = () => {
    // Keep in viewport coordinates to match getBoundingClientRect
    const x1 = Math.min(dragStartPoint.current.x, dragCurrentPoint.current.x);
    const y1 = Math.min(dragStartPoint.current.y, dragCurrentPoint.current.y);
    const x2 = Math.max(dragStartPoint.current.x, dragCurrentPoint.current.x);
    const y2 = Math.max(dragStartPoint.current.y, dragCurrentPoint.current.y);
    return { left: x1, top: y1, right: x2, bottom: y2, width: x2 - x1, height: y2 - y1 };
  };

  const rectIntersectionArea = (a, b) => {
    const left = Math.max(a.left, b.left);
    const right = Math.min(a.right, b.right);
    const top = Math.max(a.top, b.top);
    const bottom = Math.min(a.bottom, b.bottom);
    const w = Math.max(0, right - left);
    const h = Math.max(0, bottom - top);
    return w * h;
  };

  const indicesOverlappedByDrag = () => {
    const drag = getDragRect();
    const overlapped = new Set();
    const isPoint = drag.width <= 0 && drag.height <= 0;
    wordRects.current.forEach((rect, idx) => {
      if (!rect) return;
      if (isPoint) {
        if (drag.left >= rect.left && drag.left <= rect.right && drag.top >= rect.top && drag.top <= rect.bottom) {
          overlapped.add(idx);
        }
      } else {
        const area = rect.width * rect.height || 1;
        const inter = rectIntersectionArea(drag, rect);
        if (inter / area >= 0.5) overlapped.add(idx);
      }
    });
    return overlapped;
  };

  // Click toggles a single word
  const handleWordClick = (wordIndex) => {
    if (wordIndex < 0) return;
    if (mode === 'self-check' || mode === 'self_check') {
      if (showAnswer) return;
    }
    if (mode === 'graded' && checked) return;

    const next = new Set(selectedIndices);
    if (next.has(wordIndex)) next.delete(wordIndex); else next.add(wordIndex);
    setSelectedIndices(next);
    if (mode === 'immediate') updateImmediateFeedback(next);
  };

  // Drag selection: paint to add/remove based on starting word selection
  const startDrag = (clientX, clientY, startWordIndex) => {
    dragging.current = true;
    dragStartPoint.current = { x: clientX, y: clientY };
    dragCurrentPoint.current = { x: clientX, y: clientY };
    selectionAtDragStart.current = new Set(selectedIndices);
    computeWordRects();
    // Simpler logic: if we start on a word, toggle based on that word's state
    // Otherwise default to selecting (most common user intent)
    if (typeof startWordIndex === 'number' && startWordIndex >= 0) {
      paintSelect.current = !selectionAtDragStart.current.has(startWordIndex);
    } else {
      paintSelect.current = true; // Default to selecting when starting in empty space
    }
  };

  const updateDrag = (clientX, clientY) => {
    if (!dragging.current) return;
    dragCurrentPoint.current = { x: clientX, y: clientY };
    const overlapped = indicesOverlappedByDrag();
    const base = selectionAtDragStart.current;
    const next = new Set(base);
    overlapped.forEach((idx) => {
      if (paintSelect.current) {
        next.add(idx);
      } else {
        next.delete(idx);
      }
    });
    setSelectedIndices(next);
    if (mode === 'immediate') updateImmediateFeedback(next);
  };

  const endDrag = () => {
    dragging.current = false;
  };

  // Mouse event handlers
  const handleMouseDown = (e, wordIndex) => {
    if (mode === 'self-check' || mode === 'self_check') {
      if (showAnswer) return;
    }
    if (mode === 'graded' && checked) return;
    e.preventDefault();
    e.stopPropagation();
    startDrag(e.clientX, e.clientY, wordIndex);
  };

  const handleContainerMouseDown = (e) => {
    if (mode === 'self-check' || mode === 'self_check') {
      if (showAnswer) return;
    }
    if (mode === 'graded' && checked) return;
    e.preventDefault();
    startDrag(e.clientX, e.clientY, null);
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      updateDrag(e.clientX, e.clientY);
    };
    const onUp = () => {
      if (!dragging.current) return;
      endDrag();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // Clean up refs on unmount
      wordRefs.current.clear();
      wordRects.current.clear();
    };
    // No dependencies - handlers use refs which are stable
  }, []);

  // Check answers for graded mode
  const checkAnswers = () => {
    setChecked(true);
    setAttempts(attempts + 1);
    if (stats.isComplete) {
      setFeedback('Correct! You selected all target segments.');
    } else {
      setFeedback(`${stats.correctSegments}/${stats.totalSegments} correct • ${stats.incorrectSegments} errors`);
    }
  };

  // Reset for new attempt
  const resetGraded = () => {
    setChecked(false);
    setSelectedArray([]);
    setFeedback('');
  };

  // Reveal answer for self-check mode
  const revealAnswer = () => setShowAnswer(true);

  // Get word color based on state and mode
  const getWordStyle = (word) => {
    if (word.index < 0) return {};
    const isSelected = selectedIndices.has(word.index);

    let backgroundColor = '';
    let borderColor = '';
    let cursor = 'pointer';

    // Self-check mode with answer shown
    if (mode === 'self-check' || mode === 'self_check') {
      if (showAnswer) {
        if (word.isRequired) backgroundColor = '#c3f0c3';
        else if (word.isOptional) backgroundColor = '#fff3cd';
        else if (word.isFeedbackTrigger) backgroundColor = '#ffcdd2';
        cursor = 'default';
      } else if (isSelected) {
        // before reveal: neutral selection visualization
        backgroundColor = '#e0e0e0';
      }
    }
    // Graded mode after check or immediate mode with realtime feedback
    else if ((mode === 'graded' && checked) || (mode === 'immediate' && showRealtimeFeedback)) {
      if (isSelected) {
        if (!correctIndices.has(word.index)) {
          backgroundColor = '#ffcdd2';
        } else {
          // Only show green/yellow if the whole group (all required in it) is satisfied
          const g = groups.byToken?.get(word.index);
          let groupSatisfied = true;
          if (g) {
            for (const idx of g.required) { if (!selectedIndices.has(idx)) { groupSatisfied = false; break; } }
          }
          if (groupSatisfied) {
            backgroundColor = word.isRequired ? '#c3f0c3' : '#fff3cd';
          } else {
            backgroundColor = '#e3e3e3';
            borderColor = '#9e9e9e';
          }
        }
      }
    } else {
      // Selection state (all modes before reveal/check) — gray
      if (isSelected) {
        backgroundColor = '#e3e3e3';
        borderColor = '#9e9e9e';
      }
    }

    return {
      backgroundColor,
      outline: borderColor ? `2px solid ${borderColor}` : '',
      outlineOffset: '-2px',
      borderRadius: '3px',
      padding: '2px 4px',
      margin: '0 -2px',
      cursor,
      userSelect: 'none'
    };
  };

  // Error display
  if (parsed.error) {
    return (
      <div className="text-highlight-error p-4 border-2 border-red-500 rounded bg-red-50">
        <div className="font-bold text-red-800 mb-2">TextHighlight Error</div>
        <div className="text-red-700">{parsed.prompt}</div>
      </div>
    );
  }

  return (
    <div
      className="text-highlight-container p-4 border rounded-lg"
      ref={containerRef}
      style={{ userSelect: 'none' }}
    >
      <div className="prompt mb-4 font-semibold text-lg">{parsed.prompt}</div>

      <div className="text-content mb-4 text-base leading-relaxed" onMouseDown={handleContainerMouseDown}>
        {wordData.map((word, idx) => (
          <span
            key={idx}
            ref={(el) => {
              if (word.index >= 0) {
                if (el) wordRefs.current.set(word.index, el);
                else wordRefs.current.delete(word.index);
              }
            }}
            onMouseDown={(e) => handleMouseDown(e, word.index)}
            onClick={() => handleWordClick(word.index)}
            style={getWordStyle(word)}
          >
            {word.text}
          </span>
        ))}
      </div>

      {feedback && (
        <div className={`feedback mb-4 p-3 rounded ${stats.isComplete ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
          {feedback}
        </div>
      )}

      <div className="controls flex gap-2">
        {mode === 'graded' && !checked && (
          <button onClick={checkAnswers} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Check</button>
        )}
        {mode === 'graded' && checked && (
          <button onClick={resetGraded} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">Try Again</button>
        )}
        {(mode === 'self-check' || mode === 'self_check') && !showAnswer && (
          <button onClick={revealAnswer} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">Compare</button>
        )}
      </div>

      {mode === 'immediate' && !showRealtimeFeedback && (
        <div className="status mt-2 text-sm text-gray-600">
          {stats.correctSegments}/{stats.totalSegments} correct
          {stats.incorrectSegments > 0 && ` • ${stats.incorrectSegments} errors`}
        </div>
      )}
    </div>
  );
}
