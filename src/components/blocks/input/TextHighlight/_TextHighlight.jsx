// src/components/blocks/TextHighlight/_TextHighlight.jsx
'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useReduxState } from '@/lib/state';
import { DisplayError } from '@/lib/util/debug';

export default function _TextHighlight(props) {
  const { kids = {}, mode = 'immediate', showRealtimeFeedback = false, fields = {} } = props;

  // Validate mode
  const validModes = ['immediate', 'graded', 'selfcheck'];
  if (!validModes.includes(mode)) {
    return (
      <DisplayError
        props={props}
        name="TextHighlight Mode Error"
        message={`Mode must be one of: ${validModes.join(', ')}`}
        technical={`Received mode: "${mode}"`}
      />
    );
  }

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
  const [selectedArray, setSelectedArray] = useReduxState(props, fields.value, []);
  const selectedIndices = useMemo(() => new Set(selectedArray || []), [selectedArray]);
  const setSelectedIndices = (newSet) => setSelectedArray(Array.from(newSet));

  // Local state to trigger re-renders during selection
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);

  const [attempts, setAttempts] = useReduxState(props, fields.attempts, 0);
  const [feedback, setFeedback] = useReduxState(props, fields.feedback, '');
  const [showAnswer, setShowAnswer] = useReduxState(props, fields.showAnswer, false);
  const [checked, setChecked] = useReduxState(props, fields.checked, false);
  const [score, setScore] = useReduxState(props, fields.score, 0);

  // Refs for DOM elements
  const containerRef = useRef(null);
  const wordRefs = useRef(new Map()); // index -> HTMLElement

  // TODO: Consider moving selection state to Redux for learning analytics
  //
  // useRef doesn't let us fully reconstruct state.
  //
  // This is a bug for later. We want to use redux selectors, rather than hooks here,
  // probably.
  const isSelecting = useRef(false);
  const lastBrowserSelection = useRef(new Set()); // Track current browser selection

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
    setScore(correctSegments / groups.length)
  };

  // Handle native text selection
  const getSelectedWordIndices = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return new Set();

    const selectedIndices = new Set();
    const range = selection.getRangeAt(0);

    // Check each word element to see if it's in the selection
    wordRefs.current.forEach((element, index) => {
      if (!element || index < 0) return;

      // Check if this element intersects with the selection range
      const wordRange = document.createRange();
      wordRange.selectNodeContents(element);

      // Compare ranges
      const isInSelection =
        range.compareBoundaryPoints(Range.START_TO_END, wordRange) >= 0 &&
        range.compareBoundaryPoints(Range.END_TO_START, wordRange) <= 0;

      if (isInSelection) {
        selectedIndices.add(index);
      }
    });

    return selectedIndices;
  };

  /**
   * Pure function to compute new render selection
   * @param {Set} oldRenderSelection - Current rendered selection (set of word indices)
   * @param {Set} browserSelection - Browser's current selection (set of word indices)
   * @returns {Set} New render selection
   */
  const computeNewRenderSelection = (oldRenderSelection, browserSelection) => {
    // If no browser selection, return old render selection unchanged
    if (!browserSelection || browserSelection.size === 0) {
      return oldRenderSelection;
    }

    // Create new selection by toggling browser-selected words
    const newSelection = new Set(oldRenderSelection);

    browserSelection.forEach(idx => {
      if (newSelection.has(idx)) {
        newSelection.delete(idx); // Toggle off if already selected
      } else {
        newSelection.add(idx); // Toggle on if not selected
      }
    });

    return newSelection;
  };

  // Click toggles a single word
  const handleWordClick = (e, wordIndex) => {
    if (wordIndex < 0) return;
    if (mode === 'selfcheck' && showAnswer) return;
    if (mode === 'graded' && checked) return;

    // Only toggle on click without selection
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      return; // Let selection handler deal with it
    }

    const next = new Set(selectedIndices);
    if (next.has(wordIndex)) {
      next.delete(wordIndex);
    } else {
      next.add(wordIndex);
    }
    setSelectedIndices(next);
    if (mode === 'immediate') updateImmediateFeedback(next);
  };

  // Handle selection start
  const handleMouseDown = (e) => {
    if (mode === 'selfcheck' && showAnswer) return;
    if (mode === 'graded' && checked) return;

    isSelecting.current = true;
    lastBrowserSelection.current = new Set();
    window.getSelection().removeAllRanges();
  };

  // Handle selection end
  const handleMouseUp = (e) => {
    if (!isSelecting.current) return;
    isSelecting.current = false;

    const selection = window.getSelection();
    if (!selection || selection.toString().length === 0) {
      // This was just a click, not a selection
      return;
    }

    // Get the browser's selected word indices
    const browserSelection = getSelectedWordIndices();

    // Compute new render selection using pure function
    const newRenderSelection = computeNewRenderSelection(selectedIndices, browserSelection);

    // Update state with new selection
    setSelectedIndices(newRenderSelection);
    if (mode === 'immediate') updateImmediateFeedback(newRenderSelection);

    // Clear the browser selection after processing
    setTimeout(() => {
      window.getSelection().removeAllRanges();
    }, 10);
  };

  // Track browser selection changes
  useEffect(() => {
    const handleSelectionChange = () => {
      if (isSelecting.current) {
        // Update last browser selection while selecting
        lastBrowserSelection.current = getSelectedWordIndices();
        forceUpdate(); // Trigger re-render to show preview
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);

    // Capture ref value for cleanup
    const refs = wordRefs.current;

    // Cleanup on unmount
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      refs.clear();
    };
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

    // During selection: render computeNewRenderSelection(selectionState, lastBrowserSelection)
    // Idle: render selectionState
    let effectiveSelection = selectedIndices;
    if (isSelecting.current && lastBrowserSelection.current.size > 0) {
      effectiveSelection = computeNewRenderSelection(selectedIndices, lastBrowserSelection.current);
    }
    const isSelected = effectiveSelection.has(word.index);

    let backgroundColor = '';
    let borderColor = '';
    let cursor = 'pointer';

    // Selfcheck mode with answer shown
    if (mode === 'selfcheck') {
      if (showAnswer) {
        // Show instructor's answer with colors
        if (word.isRequired) backgroundColor = '#c3f0c3';
        else if (word.isOptional) backgroundColor = '#fff3cd';
        else if (word.isFeedbackTrigger) backgroundColor = '#ffcdd2';

        // Overlay student's selection with gray border
        if (isSelected) {
          borderColor = '#9e9e9e';
        }
        cursor = 'default';
      } else if (isSelected) {
        // Before reveal: neutral selection visualization
        backgroundColor = '#e0e0e0';
      }
    }
    // Graded mode after check or immediate mode with realtime feedback
    else if ((mode === 'graded' && checked) || (mode === 'immediate' && showRealtimeFeedback)) {
      if (isSelected) {
        if (!correctIndices.has(word.index)) {
          // Student selected incorrectly - red background
          backgroundColor = '#ffcdd2';
        } else {
          // Student selected correctly - green/yellow background
          backgroundColor = word.isRequired ? '#c3f0c3' : '#fff3cd';
        }
      } else if (correctIndices.has(word.index)) {
        // Student missed this - dashed border to show what should be selected
        borderColor = word.isRequired ? '#4ade80' : '#fbbf24';
        backgroundColor = 'transparent';
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
      outline: borderColor ? `2px ${backgroundColor === 'transparent' ? 'dashed' : 'solid'} ${borderColor}` : '',
      outlineOffset: '-2px',
      borderRadius: '3px',
      padding: '2px 4px',
      margin: '0 -2px',
      cursor
    };
  };

  // Error display
  if (parsed.error) {
    return (
      <DisplayError
        props={props}
        name="TextHighlight Parsing Error"
        message="Unable to parse TextHighlight content"
        technical={parsed.prompt}
      />
    );
  }

  return (
    <div
      className="text-highlight-container p-4 border rounded-lg"
      ref={containerRef}
    >
      <style>{`
        .text-highlight-container .text-content ::selection {
          background-color: transparent;
        }
        .text-highlight-container .text-content ::-moz-selection {
          background-color: transparent;
        }
      `}</style>
      <div className="prompt mb-4 font-semibold text-lg">{parsed.prompt}</div>

      <div
        className="text-content mb-4 text-base leading-relaxed"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        style={{
          WebkitUserSelect: 'text',
          MozUserSelect: 'text',
          msUserSelect: 'text',
          userSelect: 'text'
        }}
      >
        {wordData.map((word, idx) => (
          <span
            key={idx}
            ref={(el) => {
              if (word.index >= 0) {
                if (el) wordRefs.current.set(word.index, el);
                else wordRefs.current.delete(word.index);
              }
            }}
            onClick={(e) => handleWordClick(e, word.index)}
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
        {mode === 'selfcheck' && !showAnswer && (
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
