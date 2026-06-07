// _OnShow - triggers child action blocks on first view (default) or every view.

'use client';
import type { RuntimeProps } from '@/lib/types';

import { useEffect, useRef } from 'react';
import { executeNodeActions } from '@/lib/blocks';
import { useFieldState } from '@/lib/state';
import { useKids } from '@/lib/render';

function _OnShow(props: RuntimeProps) {
  const { mode = 'once' } = props;

  // Side-effect: registers child nodes in OLX DOM for executeNodeActions
  const { kids: _kids } = useKids(props);
  const [hasRun, setHasRun] = useFieldState(props, props.fields.hasRun, false);

  // Ref to avoid stale props in the effect closure
  const propsRef = useRef(props);
  propsRef.current = props;

  // Each mode: runs when the block is rendered in a mounted view
  useEffect(() => {
    if (mode !== 'each') return;
    if (propsRef.current.runtime.sideEffectFree) return;
    executeNodeActions(propsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once mode: runs once for the component ID across remounts
  useEffect(() => {
    if (mode !== 'once') return;
    if (hasRun || propsRef.current.runtime.sideEffectFree) return;
    executeNodeActions(propsRef.current);
    setHasRun(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRun, mode]);

  return null;
}

export default _OnShow;
