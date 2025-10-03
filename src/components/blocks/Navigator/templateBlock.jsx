// src/components/blocks/Navigator/TemplateBlock.jsx
//
// Generic factory for creating template-based blocks that can accept data via:
// 1. Attributes: <BlockName field1="value1" field2="value2" />
// 2. YAML text content: <BlockName>field1: value1\nfield2: value2</BlockName>
//
// Similar to StubBlock but for actual rendering components

import React from 'react';
import * as parsers from '@/lib/content/parsers';
import { dev } from '@/lib/blocks';
import { DisplayError } from '@/lib/util/debug';

/**
 * Parse simple YAML text into an object
 * Handles basic key:value pairs and simple arrays [item1, item2]
 */
function parseSimpleYAML(text) {
  if (!text || typeof text !== 'string') return {};

  const result = {};
  const lines = text.split('\n').map(line => line.trim()).filter(line => line);

  lines.forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();

      // Handle arrays (simple comma-separated values in brackets)
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(v => v.trim().replace(/['"]/g, ''));
      }

      result[key] = value;
    }
  });

  return result;
}

/**
 * Create a template-based block component
 *
 * @param {string} name - Block name
 * @param {Function} renderTemplate - Function that takes (data, props) and returns JSX
 * @param {Object} options - Additional options
 * @param {Array<string>} options.requiredFields - Fields that must be present
 * @param {Object} options.defaultValues - Default values for fields
 *
 * @example
 * const TeamDetail = createTemplateBlock('TeamDetail', (data) => (
 *   <div>
 *     <h2>{data.name}</h2>
 *     <p>{data.role}</p>
 *   </div>
 * ), { requiredFields: ['name'] });
 */
export function createTemplateBlock(name, renderTemplate, options = {}) {
  const {
    requiredFields = [],
    defaultValues = {},
  } = options;

  return dev({
    ...parsers.text(),
    name,
    description: `Template component for ${name}`,
    component: (props) => {
      const { kids, ...attributes } = props;

      // Merge data from YAML content and attributes
      // Attributes take precedence over YAML
      let yamlData = {};
      if (kids && typeof kids === 'string') {
        yamlData = parseSimpleYAML(kids);
      }

      const data = {
        ...defaultValues,
        ...yamlData,
        ...attributes,
      };

      // Check for required fields
      const missingFields = requiredFields.filter(field => !data[field]);

      if (missingFields.length > 0) {
        return (
          <DisplayError
            props={props}
            name={name}
            message="Missing required fields"
            technical={`Required: ${missingFields.join(', ')}`}
            data={data}
          />
        );
      }

      try {
        return renderTemplate(data, props);
      } catch (error) {
        return (
          <DisplayError
            props={props}
            name={name}
            message="Render error"
            technical={error.message}
            data={data}
          />
        );
      }
    },
    requiresUniqueId: false
  });
}
