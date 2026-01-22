// src/lib/util/debug.tsx
'use client';

import React, { ReactNode, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { parseProvenance, formatProvenance } from '@/lib/lofs/provenance';
import { getExtension } from '@/lib/util/fileTypes';
import { useReduxState, settings } from '@/lib/state';

interface TraceProps {
  children?: ReactNode;
  props?: any;
  header?: string;
}

export const Trace = ({
  children,
  props = {},
  header
}: TraceProps) => {
  const [debug] = useReduxState(props, settings.debug, false,
    { tag: true, id: true} // HACK
  );
  if (!debug) return null;

  let headerContent = header;
  // If a header isn't provided, try to build one from props
  if (!headerContent && props) {
    // Try to get a displayName or fallback to props.url_name/id
    const name = props?.nodeInfo?.node?.tag ?? 'N/A';
    const id = props?.id ?? 'n/a';
    headerContent = `[${name} / (id: ${id})]`;
  }

  return (
    <pre style={{ marginBottom: 8 }}>
      [{headerContent}]
      {children ? <div>{children}</div> : null}
    </pre>
  );
};

interface DebugWrapperProps {
  props?: any;
  loBlock?: any;
  children?: ReactNode;
}

// Clickable span styled like a link - avoids nested button issues
const ClickableText = ({ onClick, children, style = {}, title }: {
  onClick: () => void;
  children: ReactNode;
  style?: React.CSSProperties;
  title?: string;
}) => (
  <span
    role="button"
    tabIndex={0}
    onClick={onClick}
    onKeyDown={(e) => e.key === 'Enter' && onClick()}
    title={title}
    style={{
      cursor: 'pointer',
      textDecoration: 'underline',
      color: '#666',
      ...style
    }}
  >
    {children}
  </span>
);

export const DebugWrapper = ({ props = {}, loBlock, children }: DebugWrapperProps) => {
  const [debug] = useReduxState(props, settings.debug, false,
    { tag: true, id: true} // HACK
  );
  if (!debug) return <>{children}</>;

  const tag = props?.nodeInfo?.node?.tag ?? 'N/A';
  const id = props?.nodeInfo?.node?.id ?? props.id ?? 'n/a';
  const provenance = props?.nodeInfo?.node?.provenance ?? [];
  const prefix = process.env.NEXT_PUBLIC_DEBUG_LINK_PREFIX ?? '';

  const parsed = provenance.map(p => parseProvenance(p));

  const linkRenderers = {
    file: (prov, key) => {
      // TODO: Move away from absolute file:/// URIs
      // HACK: Extracts relative from absolute URI
      const rel = prov.path.split('/content/')[1] ?? prov.path;
      const href = `/studio?file=${encodeURIComponent(rel)}`;
      const fileType = getExtension(prov.path) || 'file';
      return <Link key={key} href={href} title={rel}>{fileType}</Link>;
    }
  };

  const links = parsed.map((prov, idx) => {
    const renderer = linkRenderers[prov.type];
    if (renderer) return renderer(prov, idx);
    // Fallback for non-file provenances
    const label = prov.type || 'src';
    return <a key={idx} href={`${prefix}${formatProvenance(prov)}`}>{label}</a>;
  });

  const handleLog = () => console.log('[props]', props);

  const DebugComponent = loBlock?.extraDebug;

  return (
    <div style={{ position: 'relative', outline: '1px dashed #999', outlineOffset: -1 }}>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        fontSize: '0.65rem',
        color: '#000',
        background: 'rgba(255, 255, 255, 0.9)',
        padding: '1px 4px',
        borderRadius: '0 0 4px 0',
        zIndex: 1000,
        whiteSpace: 'nowrap',
      }}>
        [{tag}/{id}] {links.map((l, i) => <React.Fragment key={i}>{l}{' '}</React.Fragment>)}
        <ClickableText onClick={handleLog} title="Log component props to console">props</ClickableText>
      </div>
      {DebugComponent && <DebugComponent {...props} />}
      {children}
    </div>
  );
};

export const debugLog = (...args: any[]) => {
  console.log(...args);
};

interface DisplayErrorProps {
  props?: any;
  name?: string;
  message: string;
  /** Technical details (error message, stack trace, etc.) */
  technical?: string | Error | any;
  data?: any;
  id?: string;
}

// Safe, debuggable error wrapper
export function DisplayError({ props={}, name = 'Error', message, technical, data, id = 'error' }: DisplayErrorProps) {
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

  const [debug] = useReduxState(props, settings.debug, false);

  // In debug mode, crash hard
  if (debug) {
    const techMsg = technical ? ` [Technical: ${technical}]` : '';
    throw new Error(`[${name}] ${message}${techMsg}`);
  }

  // In production / non-debug mode, render friendly box
  return (
    <div key={id} className="lo-display-error bg-yellow-50 text-yellow-800 text-sm p-3 rounded border border-yellow-200 whitespace-pre-wrap overflow-auto">
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

// ============================================================================
// Toast Notification System
// ============================================================================

export type NotificationType = 'success' | 'error' | 'info';

export interface ToastNotification {
  id: number;
  type: NotificationType;
  message: string;
  detail?: string;
}

export interface UseNotificationsReturn {
  notifications: ToastNotification[];
  notify: (type: NotificationType, message: string, detail?: string) => void;
  dismiss: (id: number) => void;
}

/**
 * Hook for managing toast notifications
 * @param autoDismissMs - Time in ms before auto-dismiss (default: 4000, errors: 6000)
 */
export function useNotifications(autoDismissMs = 4000): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);
  const idRef = useRef(0);

  const notify = useCallback((type: NotificationType, message: string, detail?: string) => {
    const id = ++idRef.current;
    setNotifications(prev => [...prev, { id, type, message, detail }]);
    // Auto-dismiss (longer for errors)
    const timeout = type === 'error' ? Math.max(autoDismissMs, 6000) : autoDismissMs;
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, timeout);
  }, [autoDismissMs]);

  const dismiss = useCallback((id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  return { notifications, notify, dismiss };
}

const TOAST_ICONS: Record<NotificationType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

interface ToastNotificationsProps {
  notifications: ToastNotification[];
  onDismiss: (id: number) => void;
  /** Position on screen */
  position?: 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left';
  /** Additional className for the container */
  className?: string;
}

/**
 * Toast notification display component
 * Renders a stack of notifications with auto-dismiss and manual close
 */
export function ToastNotifications({
  notifications,
  onDismiss,
  position = 'bottom-right',
  className = '',
}: ToastNotificationsProps) {
  if (notifications.length === 0) return null;

  const positionStyles: Record<string, React.CSSProperties> = {
    'bottom-right': { bottom: 16, right: 16 },
    'top-right': { top: 16, right: 16 },
    'bottom-left': { bottom: 16, left: 16 },
    'top-left': { top: 16, left: 16 },
  };

  return (
    <div
      className={`lo-toast-container ${className}`}
      style={{
        position: 'fixed',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 400,
        ...positionStyles[position],
      }}
    >
      {notifications.map(n => (
        <div
          key={n.id}
          className={`lo-toast lo-toast-${n.type}`}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 16px',
            borderRadius: 8,
            background: n.type === 'error' ? '#fef2f2' : n.type === 'success' ? '#f0fdf4' : '#eff6ff',
            border: `1px solid ${n.type === 'error' ? '#fecaca' : n.type === 'success' ? '#bbf7d0' : '#bfdbfe'}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            animation: 'toast-slide-in 0.2s ease-out',
          }}
        >
          <span
            style={{
              fontSize: 16,
              color: n.type === 'error' ? '#dc2626' : n.type === 'success' ? '#16a34a' : '#2563eb',
            }}
          >
            {TOAST_ICONS[n.type]}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, color: '#1f2937' }}>{n.message}</div>
            {n.detail && (
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, wordBreak: 'break-word' }}>
                {n.detail}
              </div>
            )}
          </div>
          <span
            role="button"
            tabIndex={0}
            onClick={() => onDismiss(n.id)}
            onKeyDown={(e) => e.key === 'Enter' && onDismiss(n.id)}
            style={{
              cursor: 'pointer',
              padding: 0,
              fontSize: 18,
              lineHeight: 1,
              color: '#9ca3af',
            }}
            aria-label="Dismiss"
          >
            ×
          </span>
        </div>
      ))}
      <style>{`
        @keyframes toast-slide-in {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
