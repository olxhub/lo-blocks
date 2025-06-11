'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

export default function FileNav() {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    fetch('/api/files')
      .then(res => res.json())
      .then(data => setTree(data.tree))
      .catch(err => console.error(err));
  }, []);

  function renderNode(node: TreeNode) {
    if (node.type === 'file') {
      const nav = searchParams.get('nav');
      const query = nav ? `?nav=${encodeURIComponent(nav)}` : '';
      const href =
        '/edit/' + node.path.split('/').map(encodeURIComponent).join('/') + query;
      const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        router.push(href, { shallow: true } as any);
      };
      return (
        <li key={node.path} className="ml-4 list-disc">
          <a href={href} onClick={handleClick} className="text-blue-600 hover:underline">
            {node.name}
          </a>
        </li>
      );
    }

    return (
      <li key={node.path} className="ml-2">
        <details open>
          <summary className="cursor-pointer select-none">{node.name || 'content'}</summary>
          <ul className="ml-4">
            {node.children?.map(child => renderNode(child))}
          </ul>
        </details>
      </li>
    );
  }

  if (!tree) return <div>Loading...</div>;
  return <ul>{tree.children?.map(child => renderNode(child))}</ul>;
}
