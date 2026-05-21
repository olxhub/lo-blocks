// src/components/blocks/action/ShowAnswerButton/ShowAnswerButton.js
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { z_stateRefList } from '@/lib/blocks/attributeSchemas';
import _ShowAnswerButton from './_ShowAnswerButton';

const ShowAnswerButton = core({
  ...parsers.text(),
  name: 'ShowAnswerButton',
  description: 'Button that reveals the correct answer for a grader. Use target attribute to specify grader IDs.',
  category: 'action',
  component: _ShowAnswerButton,
  attributes: z.object({
    label: z.string().default('Show Answer').describe('Button text (toggles to "Hide Answer" when shown)'),
    target: z_stateRefList.optional().describe('Comma-separated grader IDs to toggle; infers from parent if omitted'),
  }).strict(),
});

export default ShowAnswerButton;
