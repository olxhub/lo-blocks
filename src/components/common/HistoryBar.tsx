// src/components/common/HistoryBar.jsx
'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocaleAttributes } from '@/lib/i18n/useLocaleAttributes';

export default function HistoryBar({
  history = [] as any[],
  index = 0,
  showDots = true,
  onPrev = () => {},
  onNext = () => {},
  onSelect = (_i: number) => {},
}) {
  const { dir } = useLocaleAttributes();
  const isRtl = dir === 'rtl';

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onPrev}
        disabled={index <= 0}
        className="p-1 disabled:opacity-50"
      >
        {isRtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
      {showDots && (
        <div className="flex gap-1 overflow-x-auto">
          {history.map((_, i) => (
            <button
              key={i}
              onClick={() => onSelect(i)}
              className={`w-2 h-2 rounded-full ${i === index ? 'bg-blue-600' : 'bg-gray-300'}`}
            />
          ))}
        </div>
      )}
      <button
        onClick={onNext}
        disabled={index >= history.length - 1}
        className="p-1 disabled:opacity-50"
      >
        {isRtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
    </div>
  );
}
