import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { debug } from '@/lib/debug'; // optional
import { render } from '@/lib/render';

export default function PreviewPage() {
  const router = useRouter();
  const { id } = router.query;

  const [idMap, setIdMap] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;

    fetch(`/api/content/${id}`)
      .then(res => res.json())
      .then(data => {
        if (!data.ok) {
          setError(data.error);
        } else {
          setIdMap(data.idMap);
          setParsed(data.parsed);
        }
      })
      .catch(err => setError(err.message));
  }, [id]);

  if (error) {
    return <pre className="text-red-600">Error: {error}</pre>;
  }

  if (!idMap) return <div>Loading...</div>;

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Preview: {id}</h1>
      <div className="space-y-4">
        {render({ node: id, idMap })}
      </div>

      {debug() && (
        <pre className="mt-4 bg-gray-100 p-4 text-xs rounded overflow-auto">
          {JSON.stringify({ idMap, parsed }, null, 2)}
        </pre>
      )}
    </div>
  );
}
