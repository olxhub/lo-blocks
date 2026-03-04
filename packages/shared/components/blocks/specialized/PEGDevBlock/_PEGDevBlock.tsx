// src/components/blocks/PEGDevBlock/_PEGDevBlock.jsx
import React from 'react';

export function _PEGDevBlock({ kids }) {
  const parsed = kids.parsed;

  return (
    <div className="border p-4 bg-white text-sm rounded shadow-sm">
      <h3 className="font-semibold mb-2">[Parse Tree]</h3>
      <pre className="text-xs text-gray-700 bg-gray-100 p-2 rounded overflow-x-auto">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    </div>
  );
}
