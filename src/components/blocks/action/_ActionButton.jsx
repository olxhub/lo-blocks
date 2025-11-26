// src/components/blocks/_ActionButton.jsx
'use client';

import React, { useCallback, useEffect, useMemo } from 'react';
import { executeNodeActions } from '@/lib/blocks';
import { renderCompiledKids } from '@/lib/render';
import { checkRequirements, parseRequirements } from '@/lib/util/prerequisites';
import { useReduxState } from '@/lib/state';
import { store } from 'lo_event/lo_event/reduxLogger.js';

function _ActionButton(props) {
  const { label, dependsOn, fields } = props;
  const requirements = useMemo(() => parseRequirements(dependsOn), [dependsOn]);
  const [isDisabled, setIsDisabled] = useReduxState(props, fields.isDisabled, requirements.length > 0);

  const evaluateRequirements = useCallback(async () => {
    if (!requirements.length) {
      setIsDisabled(false);
      return;
    }

    const satisfied = await checkRequirements(props, requirements);
    const newDisabledState = !satisfied;

    // Only update if the value actually changed
    if (newDisabledState !== isDisabled) {
      setIsDisabled(newDisabledState);
    }
  }, [props, requirements, setIsDisabled, isDisabled]);

  useEffect(() => {
    let cancelled = false;

    evaluateRequirements();

    if (!requirements.length) {
      return () => {
        cancelled = true;
      };
    }

    const unsubscribe = store.subscribe(() => {
      if (!cancelled) {
        evaluateRequirements();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [evaluateRequirements, requirements.length]);

  const onClick = () => executeNodeActions(props);
  return (
    <button onClick={onClick} disabled={isDisabled}>
      {label}
      {renderCompiledKids( props )}
    </button>
  );
}

export default _ActionButton;
