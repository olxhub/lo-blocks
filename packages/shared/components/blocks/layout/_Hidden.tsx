// src/components/blocks/_Hidden.jsx
/*
 * This is a block that renders its children in the OLX DOM but does not
 * display them visually. Unlike Noop, which shows its rendered children,
 * Hidden ensures the children are processed and included in the OLX DOM
 * structure (for actions, state management, etc.) but returns null so
 * nothing appears on screen.
 */

import React from 'react';
import { useKids } from '@/lib/render';

export default function _Hidden(props) {
  // Render the children to ensure they're included in the OLX DOM
  // useKids must be called unconditionally
  const { kids: _kids } = useKids(props);

  // Return null to hide the content visually
  return null;
}