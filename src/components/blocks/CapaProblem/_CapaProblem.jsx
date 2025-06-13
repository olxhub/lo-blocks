// src/components/blocks/CapaProblem/_CapaProblem.jsx
'use client';
import React from 'react';
import { renderCompiledKids } from '@/lib/render';

export default function _CapaProblem(props) {
  return (
    <>{renderCompiledKids({ ...props, kids: props.kids })}</>
  );
}
