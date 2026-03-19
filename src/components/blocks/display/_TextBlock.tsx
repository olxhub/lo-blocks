// src/components/blocks/_TextBlock.jsx
'use client';
import React from 'react';

// TextBlock uses parsers.text() which returns string kids
function _TextBlock(props) {
  const { kids } = props;
  return <div>{kids}</div>;
}

export default _TextBlock;
