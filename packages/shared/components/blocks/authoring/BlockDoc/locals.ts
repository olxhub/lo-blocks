// packages/shared/components/blocks/authoring/BlockDoc/locals.ts
//
// Component-scoped UI-state field for BlockDoc's tab strip, following the
// Catalog block's locals.ts pattern.

import * as state from '@/lib/state';

/** BlockDoc fields: which tab (Overview / README / an example) is active. */
export const blockDocFields = state.fields(['docTab']);
