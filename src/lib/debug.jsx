import React from 'react';

export const Trace = ({
  children,
  props = {},
  header
}) => {
  if (!props?.debug) return null;

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

export const DebugWrapper = ({ props = {}, spec, children }) => {
  if (!props?.debug) return <>{children}</>;

  const tag = props?.nodeInfo?.node?.tag || 'N/A';
  const id = props?.nodeInfo?.node?.id || props.id || 'n/a';
  const src = props?.nodeInfo?.node?.sourceFile;
  const prefix = process.env.NEXT_PUBLIC_DEBUG_LINK_PREFIX || '';
  const link = src ? `${prefix}${src}` : null;

  const handleLog = () => console.log('[props]', props);

  const extra = typeof spec?.extraDebug === 'function'
    ? spec.extraDebug(props)
    : null;

  return (
    <div style={{ border: '1px dashed #999', padding: 4, margin: 2 }}>
      <div style={{ fontSize: '0.75rem', marginBottom: 4 }}>
        [{tag} / {id}] {link && <a href={link}>src</a>}
        <button onClick={handleLog} style={{ marginLeft: 4 }}>log</button>
      </div>
      {extra}
      {children}
    </div>
  );
};

export const debugLog = (...args) => {
  console.log(...args);
};

// 🔥 Safe, debuggable error wrapper
export function DisplayError({ props={}, name = 'Error', message, technical = null, data, id = 'error' }) {
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
  if (props?.debug) {
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
