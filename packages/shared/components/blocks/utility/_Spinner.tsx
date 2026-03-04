// src/components/blocks/_Spinner.jsx
'use client';
import React from 'react';

if (typeof window !== 'undefined') {
  import('./Spinner.css');
}

function _Spinner() {
  return (
    <div className="spinner">
      <div></div>
      <div></div>
      <div></div>
    </div>
  );
}

export default _Spinner;
