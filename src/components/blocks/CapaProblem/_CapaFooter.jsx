// src/components/blocks/CapaProblem/_CapaFooter.jsx
//
// Footer component for CapaProblem containing action buttons and status display.
// Renders: Check/Grade button, Show Answer button, correctness icon, status text.
//
'use client';
import React from 'react';
import { renderBlock } from '@/lib/render';

// We have untested logic here:
//
// 1 attempt (or final attempt) / show correctness: Grade
// Many attempts remaining: "Check"
// Black box submission (e.g. teacher-graded): Submit
//
// teacherScored is wrong. TODO: Align structure to Open edX, as closely as reasonable
function computeCheckLabel(props) {
  const { label, teacherScored, attemptsMax, attemptsUsed } = props;
  if (label) return label;
  const max = attemptsMax != null ? Number(attemptsMax) : undefined;
  const used = attemptsUsed != null ? Number(attemptsUsed) : undefined;

  if (teacherScored) return 'Submit';
  if (max === 1) return 'Grade';
  if (typeof max === 'number' && !Number.isNaN(max) && typeof used === 'number' && !Number.isNaN(used)) {
    return `Check ${used}/${max}`;
  }
  return 'Check';
}

export default function _CapaFooter(props) {
  const { id } = props;
  const target = props.target;
  const hintsTarget = props.hintsTarget; // DemandHints ID if present
  const checkLabel = computeCheckLabel(props);
  const showAnswerEnabled = props.showAnswer !== 'never';

  const buttonId = `${id}_action`;
  const showAnswerId = `${id}_show_answer`;
  const hintButtonId = `${id}_hint`;
  const statusIconId = `${id}_status_icon`;
  const statusTextId = `${id}_status_text`;

  // ActionButton needs target to trigger child grader actions
  // ShowAnswerButton targets same graders to toggle showAnswer state
  // HintButton targets DemandHints to reveal hints sequentially
  // Correctness/StatusText use requiresGrader: true - render injects graderId from CapaProblem
  return (
    <div className="lo-capafooter">
      <div className="lo-capafooter__actions">
        {renderBlock(props, 'ActionButton', { id: buttonId, label: checkLabel, target })}
        {hintsTarget && renderBlock(props, 'HintButton', { id: hintButtonId, target: hintsTarget })}
        {showAnswerEnabled && renderBlock(props, 'ShowAnswerButton', { id: showAnswerId, target })}
      </div>
      <div className="lo-capafooter__status">
        {renderBlock(props, 'Correctness', { id: statusIconId })}
        {renderBlock(props, 'StatusText', { id: statusTextId, field: 'message' })}
      </div>
    </div>
  );
}
