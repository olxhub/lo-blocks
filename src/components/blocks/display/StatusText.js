// src/components/blocks/StatusText.jsx
//
// StatusText displays field values from OTHER components (typically graders).
//
// IMPORTANT: This component does NOT display its own status - it displays
// status/field values from related components like graders or inputs.
//
// Currently defaults to related graders, unless specified otherwise.
// TODO: In the future, we'll want to either specialize to GraderStatus and StatusText,
// or allow us to infer based on a hasStatus or similar property.
//
// How it works:
// 1. Uses inferRelatedNodes to find related graders (components with isGrader=true)
// 2. Uses componentFieldByName to get the specified field from the target component
// 3. Displays that field's value using useFieldSelector
//
// Usage examples:
//   <StatusText />                    // Shows 'message' field from related grader
//   <StatusText field="status" />     // Shows 'status' field from related grader
//   <StatusText field="correct" />    // Shows 'correct' field from related grader
//   <StatusText target="grader1" />  // Shows 'message' field from specific component
//
// The field must exist in the TARGET component, not in StatusText itself.
// Will throw clear error if the target component doesn't have the requested field.
//
import { dev } from '@/lib/blocks';
import { ignore } from '@/lib/content/parsers';
import _StatusText from './_StatusText';

const StatusText = dev({
  ...ignore(),
  name: 'StatusText',
  description: 'Displays field values from related components (typically graders). Use field="fieldName" to specify which field to display.',
  component: _StatusText
});

export default StatusText;
