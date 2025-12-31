// src/components/blocks/_Noop.jsx
/*
 * This is a block which renders nothing, and is useful for things
 * like pure actions where we need a node in the OLX tree, but for
 * nothing to render.
 *
 * We might want to expand this to be a smarter dummy block, for
 * example by:
 * - Rendering children too?
 * - Raising exceptions if passed children / unexpected attributes?
 */

import React from 'react';
import { useKids } from '@/lib/render';

export default function _Noop(props) {
  const { kids } = useKids(props);
  return <>{kids}</>;
}
