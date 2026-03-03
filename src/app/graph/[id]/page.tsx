// src/app/graph/[id]/page.tsx
//
// Server component wrapper. Renders the client-side GraphPage component.
//
import GraphPage from './GraphPage';
import { getStaticContentIds } from '@/lib/content/staticParams';

export const generateStaticParams = getStaticContentIds;

export default function Page() {
  return <GraphPage />;
}
