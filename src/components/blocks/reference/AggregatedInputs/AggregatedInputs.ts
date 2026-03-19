// src/components/blocks/reference/AggregatedInputs.js
import { z } from 'zod';
import { dev } from '@/lib/blocks';
import { ignore } from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _AggregatedInputs from './_AggregatedInputs';

const AggregatedInputs = dev({
  ...ignore(),
  name: 'AggregatedInputs',
  description: 'Aggregates grader correctness values and displays progress.',
  component: _AggregatedInputs,
  attributes: baseAttributes.extend({
    target: z.string().optional().describe('Comma-separated list of component IDs to aggregate'),
    field: z.string().optional().describe('Field name to aggregate (default: "value")'),
    fallback: z.string().optional().describe('Fallback value when field is empty'),
    aggregate: z.enum(['list', 'object']).optional().describe('Aggregation mode: "list" (array) or "object" (keyed by ID)'),
    asObject: z.enum(['true', 'false']).optional().describe('Return results as object keyed by ID (deprecated, use aggregate="object")'),
    heading: z.string().optional().describe('Heading text for the display'),
  }),
});

export default AggregatedInputs;