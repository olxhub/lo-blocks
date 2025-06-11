'use client';

import React from 'react';
import { renderCompiledKids } from '@/lib/render';

export function _DevProblem(params) {
  return (
    <div className="border p-4 space-y-2">
      {renderCompiledKids({ ...params, kids: params.kids })}
    </div>
  );
}
