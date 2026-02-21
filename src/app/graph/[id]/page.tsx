// src/app/graph/[id]/page.tsx
//
// Server component wrapper. Exports generateStaticParams for static builds
// and renders the client-side GraphPage component.
//
// Graph pages are a developer tool — not included in static export.
//
import GraphPage from './_GraphPage';
import { getStaticContentIds } from '@/lib/content/staticParams';

export const generateStaticParams = getStaticContentIds;

export default function Page() {
  return <GraphPage />;
}
