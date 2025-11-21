// src/components/blocks/_ActionButton.jsx
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { executeNodeActions } from '@/lib/blocks';
import { renderCompiledKids } from '@/lib/render';
import { checkRequirements, parseRequirements } from '@/lib/util/requirements';
import { store } from 'lo_event/lo_event/reduxLogger.js';

function _ActionButton(props) {
  const { label, dependsOn } = props;
  const requirements = useMemo(() => parseRequirements(dependsOn), [dependsOn]);
  const [isDisabled, setIsDisabled] = useState(requirements.length > 0);

  const evaluateRequirements = useCallback(async () => {
    if (!requirements.length) {
      setIsDisabled(false);
      return;
    }

    const satisfied = await checkRequirements(props, requirements);
    setIsDisabled(!satisfied);
  }, [props, requirements]);

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
