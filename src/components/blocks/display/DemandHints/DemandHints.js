// src/components/blocks/display/DemandHints/DemandHints.js
//
// Sequential hint display - reveals hints one at a time as user requests them.
//
// Usage inside a grader or CapaProblem:
//   <DemandHints id="hints">
//     <Hint>First hint...</Hint>
//     <Hint>Second hint...</Hint>
//     <Hint>Third hint...</Hint>
//   </DemandHints>
//
// The HintButton component (in CapaFooter) controls revealing hints.
//
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import _DemandHints from './_DemandHints';

export const fields = state.fields(['hintsRevealed']);

const DemandHints = core({
  ...parsers.blocks.allowHTML(),
  name: 'DemandHints',
  description: 'Sequential hint reveal - shows hints one at a time',
  category: 'display',
  component: _DemandHints,
  fields,
  locals: {
    // Get total number of hints
    getHintCount: (props) => {
      const kids = props.kids;
      if (!kids) return 0;
      // Kids can be array of blocks or a single block
      if (Array.isArray(kids)) {
        return kids.filter(k => k.type === 'block').length;
      }
      return kids.type === 'block' ? 1 : 0;
    }
  }
});

export default DemandHints;
