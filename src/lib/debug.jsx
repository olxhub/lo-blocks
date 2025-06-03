import React from 'react';

export const debug = ()=> true;

export const Trace = ({
  children,
  props = {},
  header,
  override = debug(),
}) => {
  if (!override) return null;

  let headerContent = header;
  // If a header isn't provided, try to build one from props
  if (!headerContent && props) {
    // Try to get a displayName or fallback to props.url_name/id
    const name = props?.nodeInfo?.node?.tag || 'N/A';
    const id = props?.id || 'n/a';
    headerContent = `[${name} / (id: ${id})]`;
  }

  return (
    <pre style={{ marginBottom: 8 }}>
      [{headerContent}]
      {children ? <div>{children}</div> : null}
    </pre>
  );
};

export const debugLog = (...args) => {
  if (debug()) {
    console.log(...args);
  }
};

/*
// 🔥 Safe, debuggable error wrapper
//
// We might want to expand this for more human-friendly debugging and specific contexts (e.g. BrokenBlock when developing blocks)
export function DisplayError({ name = 'Error', message, data, id = 'error' }) {
  // Log raw data for dev console inspection
  debugLog(`[${name}] ${message}`, data);

  // In dev/test, crash hard
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(`[${name}] ${message}`);
  }

  // Helper: stringify safely
  const safe = (value) => {
    if (typeof value === 'string' || typeof value === 'number') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return '[Unserializable]';
    }
  };

  return (
    <pre key={id} className="text-red-500 text-xs bg-red-50 p-2 rounded whitespace-pre-wrap overflow-auto">
      [{safe(name)}]: {safe(message)}
    </pre>
  );
}*/
// 🔥 Safe, debuggable error wrapper
export function DisplayError({ name = 'Error', message, technical = null, data, id = 'error' }) {
  // Log raw data for dev console inspection
  debugLog(`[${name}] ${message}`, { technical, data });

  // Helper: stringify safely
  const safe = (value) => {
    if (typeof value === 'string' || typeof value === 'number') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '[Unserializable]';
    }
  };

  // In debug mode, crash hard
  if (debug()) {
    const techMsg = technical ? ` [Technical: ${technical}]` : '';
    throw new Error(`[${name}] ${message}${techMsg}`);
  }

  // In production / non-debug mode, render friendly box
  return (
    <div key={id} className="bg-yellow-50 text-yellow-800 text-sm p-3 rounded border border-yellow-200 whitespace-pre-wrap overflow-auto">
      <div><strong>{name}</strong>: {message}</div>

      {technical && (
        <details style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
          <summary>Technical Details</summary>
          <pre className="overflow-auto mt-2">{safe(technical)}</pre>
        </details>
      )}
    </div>
  );
}
