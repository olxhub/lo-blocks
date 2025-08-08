// src/components/blocks/CapaProblem/_CapaButton.jsx
'use client';
import React from 'react';
import { renderBlock } from '@/lib/renderHelpers';

// We have untested logic here:
//
// 1 attempt (or final attempt) / show correctness: Grade
// Many attempts remaining: "Check"
// Black box submission (e.g. teacher-graded): Submit
//
// teacherScored is wrong. TODO: Align structure to Open edX, as closely as reasonable
function computeLabel(props) {
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

export default function _CapaButton(props) {
  const { id, idMap, nodeInfo, componentMap, idPrefix } = props;
  const targets = props.targets;
  const label = computeLabel(props);

  const buttonId = `${id}_action`;
  const statusIconId = `${id}_status_icon`;
  const statusTextId = `${id}_status_text`;

  return (
    <div className="lo-capabutton">
      <div className="lo-capabutton__primary">
        {renderBlock(props, 'ActionButton', { id: buttonId, label, targets })}
      </div>
      <div className="lo-capabutton__status">
        {renderBlock(props, 'Correctness', { id: statusIconId, targets })}
        {renderBlock(props, 'StatusText', { id: statusTextId, targets, field: 'message' })}
      </div>
    </div>
  );
}
