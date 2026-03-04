// src/components/common/Spinner.tsx
'use client';
import React, { useState, useEffect } from 'react';
import _Spinner from '@/components/blocks/utility/_Spinner';

// Usage:
// <Spinner>Loading...</Spinner>
// <Spinner texts={["Loading content...", "Preparing activity...", "Almost ready..."]} />
// <Spinner texts={["Feeding carrier pigeons...", "Preparing TCP packets..."]} interval={2000} />

interface SpinnerProps {
  children?: string;
  texts?: string[];
  interval?: number;
}

/**
 * Loading spinner component
 * Can show a single message or cycle through multiple messages
 */
export default function Spinner({ children, texts, interval = 3000 }: SpinnerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!texts || texts.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % texts.length);
    }, interval);

    return () => clearInterval(timer);
  }, [texts, interval]);

  const message = texts ? texts[currentIndex] : children;

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-4">
      <_Spinner />
      {message && <p className="text-gray-600 text-sm">{message}</p>}
    </div>
  );
}
