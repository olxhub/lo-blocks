// packages/shared/lib/blocks/dynamicBlockError.tsx
//
// Error-placeholder block for dynamic loading. When a blueprint throws on
// import, fails validation, or exports the wrong shape, the loader registers
// one of these under the intended tag instead of crashing — the same
// "errors are content" posture as OLX ErrorNode (docs/dynamic-blocks.md). Its
// component renders the message inline where the block would have appeared,
// so chat and the editor surface it immediately.

import React from 'react';
import * as parsers from '@/lib/content/parsers';
import { dev } from '@/lib/blocks';
import { DisplayError } from '@/lib/util/debug';
import type { LoBlock, OLXTag, RuntimeProps } from '@/lib/types';

/**
 * Build a block that renders `message` where `<tag>` would appear. The
 * message is baked into the component (the failed block has no blueprint to
 * carry it), so authors see exactly why their block did not load.
 */
export function createErrorBlock(tag: OLXTag, message: string): LoBlock {
  function DynamicBlockError(props: RuntimeProps) {
    return (
      <DisplayError
        props={props}
        title={`Block "${tag}" failed to load`}
        message={message}
        id={`${props.id}_dynamic_block_error`}
      />
    );
  }
  DynamicBlockError.displayName = `DynamicBlockError_${tag}`;

  return dev({
    // Accept (and ignore) any block/text children so a failed block still
    // parses in place instead of turning into an unknown-tag error.
    ...parsers.blocks(),
    name: tag,
    description: `Dynamic block "${tag}" failed to load`,
    internal: true,
    component: DynamicBlockError,
  });
}
