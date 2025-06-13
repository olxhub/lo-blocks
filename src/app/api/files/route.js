// src/app/api/files/route.js
import { listFileTree } from '@/lib/storage';

export async function GET() {
  const tree = await listFileTree();
  return Response.json({ ok: true, tree });
}
