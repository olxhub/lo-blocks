// src/components/blocks/_ActionButton.jsx
'use client';

import React, { useCallback, useEffect, useMemo } from 'react';
import { executeNodeActions } from '@/lib/blocks';
import { useKids } from '@/lib/render';
import { checkPrerequisites, parsePrerequisites } from '@/lib/util/prerequisites';
import { useReduxState } from '@/lib/state';
import { store } from 'lo_event/lo_event/reduxLogger.js';

function _ActionButton(props) {
  const { label, dependsOn, fields } = props;
  const prerequisites = useMemo(() => parsePrerequisites(dependsOn), [dependsOn]);
  const [isDisabled, setIsDisabled] = useReduxState(props, fields.isDisabled, prerequisites.length > 0);

  const evaluatePrerequisites = useCallback(async () => {
    if (!prerequisites.length) {
      setIsDisabled(false);
      return;
    }

    const satisfied = await checkPrerequisites(props, prerequisites);
    const newDisabledState = !satisfied;

    // Only update if the value actually changed
    if (newDisabledState !== isDisabled) {
      setIsDisabled(newDisabledState);
    }
  }, [props, prerequisites, setIsDisabled, isDisabled]);

  useEffect(() => {
    let cancelled = false;

    evaluatePrerequisites();

    if (!prerequisites.length) {
      return () => {
        cancelled = true;
      };
    }

    const unsubscribe = store.subscribe(() => {
      if (!cancelled) {
        evaluatePrerequisites();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [evaluatePrerequisites, prerequisites.length]);

  const { kids } = useKids(props);

  const onClick = () => executeNodeActions(props);
  return (
    <button onClick={onClick} disabled={isDisabled}>
      {label}
      {kids}
    </button>
  );
}

export default _ActionButton;
