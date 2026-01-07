// src/components/blocks/_ActionButton.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { executeNodeActions } from '@/lib/blocks';
import { useKids } from '@/lib/render';
import { checkPrerequisites, parsePrerequisites } from '@/lib/util/prerequisites';
import { useReduxState } from '@/lib/state';

function _ActionButton(props) {
  const { label, dependsOn, fields, store } = props;
  const prerequisites = useMemo(() => parsePrerequisites(dependsOn), [dependsOn]);
  const [isDisabled, setIsDisabled] = useReduxState(props, fields.isDisabled, prerequisites.length > 0);

  // Use ref for comparison to avoid infinite loops (isDisabled in deps would cause callback recreation)
  const isDisabledRef = useRef(isDisabled);
  isDisabledRef.current = isDisabled;

  const evaluatePrerequisites = useCallback(async () => {
    if (!prerequisites.length) {
      if (isDisabledRef.current !== false) {
        setIsDisabled(false);
      }
      return;
    }

    const satisfied = await checkPrerequisites(props, prerequisites);
    const newDisabledState = !satisfied;

    // Only update if the value actually changed
    if (newDisabledState !== isDisabledRef.current) {
      setIsDisabled(newDisabledState);
    }
  }, [props, prerequisites, setIsDisabled]);

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
  }, [evaluatePrerequisites, prerequisites.length, store]);

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
