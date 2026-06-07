// packages/shared/components/common/avatar/ColorField.tsx
//
// Color swatch grid with hex input, used by avatar pickers.
// Renders a row of preset color buttons + a hex text input.
'use client';

import React from 'react';
import { useInputField, updateField } from '@/lib/state';
import { isValidHexInput } from '@/lib/avatar/types';
import type { RuntimeProps, FieldInfo } from '@/lib/types';

interface ColorFieldProps {
  label: string;
  presets: string[];
  field: FieldInfo;
  props: RuntimeProps;
}

export default function ColorField({ label, presets, field, props }: ColorFieldProps) {
  const [value, inputProps] = useInputField(
    props, field, '', { updateValidator: isValidHexInput },
  );

  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700 mb-2">{label}</h4>
      <div className="flex gap-2 flex-wrap mb-2">
        {presets.map(color => (
          <button
            key={color}
            onClick={() => updateField(props, field, value === color ? '' : color)}
            aria-label={`Color #${color}${value === color ? ' (selected)' : ''}`}
            className={`rounded-full border-2 transition-all ${
              value === color
                ? 'border-blue-500 ring-2 ring-blue-300'
                : 'border-gray-300 hover:border-gray-500'
            }`}
            style={{ background: '#' + color, width: 32, height: 32 }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">#</span>
        <input
          {...inputProps}
          type="text"
          placeholder="e8b697"
          maxLength={6}
          className="w-24 border rounded px-2 py-1 text-sm font-mono"
        />
        {value && /^[a-fA-F0-9]{6}$/.test(value) && (
          <div
            className="rounded-full border border-gray-300"
            style={{ background: '#' + value, width: 24, height: 24 }}
          />
        )}
      </div>
    </div>
  );
}
