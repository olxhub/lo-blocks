// components/common/CopyableYaml.tsx
//
// Read-only YAML display with a copy-to-clipboard button.
// Used by AvatarEditor, CharacterBuilder, and CastEditor.
'use client';

import { useCallback, useRef, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';
import { useFieldState } from '@/lib/state';
import type { RuntimeProps, FieldInfo } from '@/lib/types';

interface CopyableYamlProps {
  yaml: string;
  props: RuntimeProps;
  copiedField: FieldInfo;
  compact?: boolean;
}

export default function CopyableYaml({ yaml, props, copiedField, compact }: CopyableYamlProps) {
  const [copied, setCopied] = useFieldState(props, copiedField, false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(yaml).then(
      () => {
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 2000);
      },
    ).catch(err => console.warn('Clipboard write failed:', err));
  }, [yaml, setCopied]);

  if (!yaml) return null;

  const iconSize = compact ? 12 : 16;

  return (
    <div className={`relative ${compact ? 'mt-3' : ''}`}>
      <button
        onClick={handleCopy}
        className={`absolute rounded hover:bg-gray-200 transition-colors ${
          compact
            ? 'top-1 right-1 p-0.5 text-gray-400 hover:text-gray-600'
            : 'top-2 right-2 p-1 text-gray-500 hover:text-gray-700'
        }`}
        title="Copy to clipboard"
      >
        {copied ? <Check size={iconSize} /> : <Copy size={iconSize} />}
      </button>
      <pre className={`bg-gray-50 rounded font-mono whitespace-pre overflow-x-auto ${
        compact
          ? 'px-2 py-1.5 text-xs text-gray-600'
          : 'border p-3 text-sm'
      }`}>
        {yaml}
      </pre>
    </div>
  );
}
