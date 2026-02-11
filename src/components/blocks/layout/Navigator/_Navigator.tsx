// src/components/blocks/layout/Navigator/_Navigator.jsx
'use client';

import React, { useMemo } from 'react';
import { useFieldState } from '@/lib/state';
import { useKids } from '@/lib/render';
import { useOlxJson } from '@/lib/blocks/useOlxJson';

// Component to render a template with item data
function TemplateContent({ props, node }) {
  const { kids } = useKids({ ...props, kids: [node] });
  return <>{kids}</>;
}

function _Navigator(props) {
  const {
    fields,
    kids,
    title = "Navigator",
    preview,
    detail,
    searchable = true,
  } = props;

  // Look up template blocks unconditionally (hooks must always be called)
  const { olxJson: previewBlock } = useOlxJson(props, preview || null);
  const { olxJson: detailBlock } = useOlxJson(props, detail || null);

  const [selectedItem, setSelectedItem] = useFieldState(props, fields.selectedItem, null);
  const [searchQuery, setSearchQuery] = useFieldState(props, fields.searchQuery, '');

  // Parse YAML data from text content
  const items = useMemo(() => {
    if (!kids) return [];

    try {
      // Get text content from kids object (parsed by text parser)
      let yamlText = '';
      if (typeof kids === 'string') {
        yamlText = kids;
      } else if (kids.text) {
        yamlText = kids.text;
      } else if (typeof kids === 'object' && kids !== null) {
        // If it's an object with no text property, it might be parsed content
        return Array.isArray(kids) ? kids : [];
      }

      if (!yamlText || typeof yamlText !== 'string') return [];

      // Simple YAML parsing for our use case
      // Split into items by lines starting with '- '
      const itemBlocks = yamlText.split(/\n(?=- )/).filter(block => block.trim());

      return itemBlocks.map((block, index) => {
        const lines = block.split('\n').map(line => line.trim()).filter(line => line);
        const item = { id: `item_${index}` };

        lines.forEach(line => {
          if (line.startsWith('- ')) line = line.substring(2);

          const colonIndex = line.indexOf(':');
          if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim();
            let value = line.substring(colonIndex + 1).trim();

            // Handle arrays (simple comma-separated values in brackets)
            let parsedValue: string | string[] = value;
            if (value.startsWith('[') && value.endsWith(']')) {
              parsedValue = value.slice(1, -1).split(',').map(v => v.trim().replace(/['"]/g, ''));
            }

            // Handle nested objects (simple key-value pairs with dots)
            if (key.includes('.')) {
              const [mainKey, subKey] = key.split('.');
              if (!item[mainKey]) item[mainKey] = {};
              item[mainKey][subKey] = parsedValue;
            } else {
              item[key] = parsedValue;
            }
          }
        });

        return item;
      });
    } catch (error) {
      console.error('Error parsing navigator data:', error);
      return [];
    }
  }, [kids]);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;

    const query = searchQuery.toLowerCase();
    return items.filter(item =>
      (item.name && item.name.toLowerCase().includes(query)) ||
      (item.title && item.title.toLowerCase().includes(query)) ||
      (item.role && item.role.toLowerCase().includes(query)) ||
      (item.description && item.description.toLowerCase().includes(query))
    );
  }, [items, searchQuery]);

  const selectedItemData = items.find(item => item.id === selectedItem);

  const handleItemClick = (itemId) => {
    setSelectedItem(selectedItem === itemId ? null : itemId);
  };

  const handleCloseDetail = () => {
    setSelectedItem(null);
  };

  // Render preview or detail using pre-fetched blocks
  const renderTemplate = (blockId, item, additionalProps = {}) => {
    // Use the pre-fetched block based on which template we're rendering
    const block = blockId === preview ? previewBlock : detailBlock;
    if (!blockId || !block) {
      return <div className="p-4 text-red-500">Template block &quot;{blockId}&quot; not found</div>;
    }

    // Create a modified node with item data merged into attributes
    // IMPORTANT: Each item needs a unique ID for caching to work correctly
    const nodeWithData = {
      ...block,
      id: `${block.id}_${item.id}`,  // Unique ID per item
      attributes: {
        ...block.attributes,
        ...item,  // Merge all item fields as attributes
        ...additionalProps
      }
    };

    return <TemplateContent props={props} node={nodeWithData} />;
  };

  return (
    <div className="navigator-component border rounded-lg bg-white overflow-hidden">
      <div className="flex h-96">
        {/* Left Panel - Item List */}
        <div className="w-1/3 border-r bg-gray-50 flex flex-col">
          <div className="p-4 border-b bg-white">
            <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
            {searchable && (
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => {
                const isSelected = selectedItem === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item.id)}
                    className={`cursor-pointer ${
                      isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                    }`}
                  >
                    {preview ? renderTemplate(preview, item, { isSelected }) : (
                      <div className="p-3 border-b hover:bg-gray-50">
                        <div className="font-medium">{item.title || item.name || item.id}</div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-gray-500 text-sm">
                {searchQuery ? 'No items match your search' : 'No items available'}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Detail View */}
        <div className="flex-1 bg-white overflow-y-auto">
          {selectedItemData ? (
            detail ? (
              <div className="relative">
                <button
                  onClick={handleCloseDetail}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl z-10"
                >
                  ×
                </button>
                {renderTemplate(detail, selectedItemData, { onClose: handleCloseDetail })}
              </div>
            ) : (
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-semibold">{selectedItemData.title || selectedItemData.name}</h2>
                  <button onClick={handleCloseDetail} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
                </div>
                <pre className="text-xs">{JSON.stringify(selectedItemData, null, 2)}</pre>
              </div>
            )
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-500">
              Select an item to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default _Navigator;
