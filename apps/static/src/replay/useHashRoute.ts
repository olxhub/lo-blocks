// apps/static/src/replay/useHashRoute.ts
//
// Tiny hash-based router for the static replay viewer. Hash routing is used so
// the viewer works on plain static hosting with no server rewrites.
//
// Routes:
//   #/                         landing (runs)
//   #/<run>                    a run's student table
//   #/<run>/<student>          a student's session list
//   #/<run>/<student>/<session> the session viewer
//
// Browser back/forward Just Work because we only ever change location.hash.
//
import { useCallback, useEffect, useState } from 'react';

export interface Route {
  run?: string;
  student?: string;
  session?: string;
}

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (!raw) return {};
  const parts = raw.split('/').filter(Boolean).map(decodeURIComponent);
  return { run: parts[0], student: parts[1], session: parts[2] };
}

export function routeToHash(r: Route): string {
  const parts = [r.run, r.student, r.session]
    .filter((p): p is string => !!p)
    .map(encodeURIComponent);
  return `#/${parts.join('/')}`;
}

export function useHashRoute(): {
  route: Route;
  navigate: (r: Route, opts?: { replace?: boolean }) => void;
} {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === 'undefined' ? {} : parseHash(),
  );

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((r: Route, opts?: { replace?: boolean }) => {
    const hash = routeToHash(r);
    if (opts?.replace) {
      window.history.replaceState(null, '', hash);
      setRoute(parseHash());
    } else if (hash !== window.location.hash) {
      window.location.hash = hash; // triggers hashchange
    }
  }, []);

  return { route, navigate };
}
