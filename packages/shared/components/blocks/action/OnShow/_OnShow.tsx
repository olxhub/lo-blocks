// _OnShow - triggers child action blocks on first view (default) or every view.

'use client';

import React, { useEffect, useRef } from 'react';
import { executeNodeActions } from '@/lib/blocks';
import { useFieldState } from '@/lib/state';
import { useKids } from '@/lib/render';

function _OnShow(props) {
  const { trigger = 'first_view' } = props;

  // Always call useKids unconditionally to build the OLX DOM tree
  const { kids: _kids } = useKids(props);
  const [hasRun, setHasRun] = useFieldState(props, props.fields.hasRun, false);

  // Ref to avoid stale props in the effect closure
  const propsRef = useRef(props);
  propsRef.current = props;

  // Each-view effect: runs when the block is rendered in a mounted view
  useEffect(() => {
    if (trigger !== 'each_view') return;
    if (propsRef.current.runtime.sideEffectFree) return;
    executeNodeActions(propsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // First-view effect: runs once for the component ID across remounts
  useEffect(() => {
    if (trigger !== 'first_view') return;
    if (hasRun || propsRef.current.runtime.sideEffectFree) return;
    executeNodeActions(propsRef.current);
    setHasRun(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRun, trigger]);

  return null;
}

export default _OnShow;
