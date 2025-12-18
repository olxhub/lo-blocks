// src/components/blocks/MarkupProblem/MarkupProblem.js
//
// MarkupProblem - Simple markup language for authoring problems
//
// Parses edX-style markdown problem syntax and generates OLX components.
// Supports multiple choice, checkboxes, text input, numerical input, dropdowns,
// hints, explanations, and demand hints.
//
// Usage:
//   <MarkupProblem src="problem.capapeg"/>
//   or inline content
//
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { peggyParser } from '@/lib/content/parsers';
import * as capaParser from '../specialized/peg_prototype/_capaParser.js';
import _Noop from '@/components/blocks/layout/_Noop';

/**
 * Transform parsed CAPA AST into OLX component structure.
 * Creates CapaProblem with appropriate graders, inputs, and content.
 */
function generateProblemComponents({ parsed, storeEntry, id, attributes }) {
  const problemId = `${id}_problem`;
  let graderIndex = 0;
  let inputIndex = 0;
  let hintIndex = 0;
  let contentIndex = 0;

  const problemKids = [];
  const demandHints = [];

  for (const block of parsed) {
    switch (block.type) {
      case 'h3': {
        // Header becomes Markdown
        const headerId = `${id}_header_${contentIndex++}`;
        storeEntry(headerId, {
          id: headerId,
          tag: 'Markdown',
          attributes: { id: headerId },
          kids: `### ${block.content}`
        });
        problemKids.push({ type: 'block', id: headerId });
        break;
      }

      case 'p': {
        // Paragraph becomes Markdown
        const pId = `${id}_p_${contentIndex++}`;
        storeEntry(pId, {
          id: pId,
          tag: 'Markdown',
          attributes: { id: pId },
          kids: block.content
        });
        problemKids.push({ type: 'block', id: pId });
        break;
      }

      case 'question': {
        // Question label becomes Markdown with emphasis
        const qId = `${id}_question_${contentIndex++}`;
        const content = typeof block.label === 'string'
          ? `**${block.label}**`
          : `**${block.label.filter(p => typeof p === 'string').join('')}**`;
        storeEntry(qId, {
          id: qId,
          tag: 'Markdown',
          attributes: { id: qId },
          kids: content
        });
        problemKids.push({ type: 'block', id: qId });
        break;
      }

      case 'choices': {
        // Multiple choice - KeyGrader with ChoiceInput
        const graderId = `${id}_grader_${graderIndex++}`;
        const inputId = `${id}_input_${inputIndex++}`;

        // Create choice items (Key for correct, Distractor for incorrect)
        const choiceKids = block.options.map((opt, i) => {
          const choiceId = `${id}_choice_${inputIndex - 1}_${i}`;
          const tag = opt.selected ? 'Key' : 'Distractor';
          storeEntry(choiceId, {
            id: choiceId,
            tag,
            attributes: { id: choiceId },
            kids: opt.text
          });
          return { type: 'block', id: choiceId };
        });

        // Store ChoiceInput
        storeEntry(inputId, {
          id: inputId,
          tag: 'ChoiceInput',
          attributes: { id: inputId },
          kids: choiceKids
        });

        // Store KeyGrader
        storeEntry(graderId, {
          id: graderId,
          tag: 'KeyGrader',
          attributes: { id: graderId, target: inputId },
          kids: [{ type: 'block', id: inputId }]
        });

        problemKids.push({ type: 'block', id: graderId });
        break;
      }

      case 'checkboxes': {
        // Checkboxes - similar to choices but multi-select
        // TODO: Implement checkbox grader
        const graderId = `${id}_grader_${graderIndex++}`;
        const inputId = `${id}_input_${inputIndex++}`;

        const choiceKids = block.options.map((opt, i) => {
          const choiceId = `${id}_checkbox_${inputIndex - 1}_${i}`;
          const tag = opt.checked ? 'Key' : 'Distractor';
          storeEntry(choiceId, {
            id: choiceId,
            tag,
            attributes: { id: choiceId },
            kids: opt.text
          });
          return { type: 'block', id: choiceId };
        });

        storeEntry(inputId, {
          id: inputId,
          tag: 'ChoiceInput',
          attributes: { id: inputId },
          kids: choiceKids
        });

        storeEntry(graderId, {
          id: graderId,
          tag: 'KeyGrader',
          attributes: { id: graderId, target: inputId },
          kids: [{ type: 'block', id: inputId }]
        });

        problemKids.push({ type: 'block', id: graderId });
        break;
      }

      case 'textInput': {
        // Text input - RulesGrader with StringMatch rules
        const graderId = `${id}_grader_${graderIndex++}`;
        const inputId = `${id}_input_${inputIndex++}`;

        const matchKids = [];

        // Primary answer
        const primaryMatchId = `${id}_match_${graderIndex - 1}_0`;
        storeEntry(primaryMatchId, {
          id: primaryMatchId,
          tag: 'StringMatch',
          attributes: {
            id: primaryMatchId,
            answer: block.answer,
            score: '1',
            feedback: block.feedback || 'Correct!'
          },
          kids: []
        });
        matchKids.push({ type: 'block', id: primaryMatchId });

        // Alternative correct answers
        if (block.alternatives) {
          block.alternatives.forEach((alt, i) => {
            const altMatchId = `${id}_match_${graderIndex - 1}_alt_${i}`;
            storeEntry(altMatchId, {
              id: altMatchId,
              tag: 'StringMatch',
              attributes: {
                id: altMatchId,
                answer: alt,
                score: '1',
                feedback: 'Correct!'
              },
              kids: []
            });
            matchKids.push({ type: 'block', id: altMatchId });
          });
        }

        // Wrong answers with feedback
        if (block.wrongAnswers) {
          block.wrongAnswers.forEach((wrong, i) => {
            const wrongMatchId = `${id}_match_${graderIndex - 1}_wrong_${i}`;
            storeEntry(wrongMatchId, {
              id: wrongMatchId,
              tag: 'StringMatch',
              attributes: {
                id: wrongMatchId,
                answer: wrong.answer,
                score: '0',
                feedback: wrong.feedback || 'Incorrect'
              },
              kids: []
            });
            matchKids.push({ type: 'block', id: wrongMatchId });
          });
        }

        // Default catch-all
        const defaultMatchId = `${id}_match_${graderIndex - 1}_default`;
        storeEntry(defaultMatchId, {
          id: defaultMatchId,
          tag: 'DefaultMatch',
          attributes: {
            id: defaultMatchId,
            score: '0',
            feedback: 'Try again'
          },
          kids: []
        });
        matchKids.push({ type: 'block', id: defaultMatchId });

        // Store LineInput
        storeEntry(inputId, {
          id: inputId,
          tag: 'LineInput',
          attributes: { id: inputId },
          kids: []
        });
        matchKids.push({ type: 'block', id: inputId });

        // Store RulesGrader
        storeEntry(graderId, {
          id: graderId,
          tag: 'RulesGrader',
          attributes: { id: graderId },
          kids: matchKids
        });

        problemKids.push({ type: 'block', id: graderId });
        break;
      }

      case 'numericalInput': {
        // Numerical input - NumericalGrader
        const graderId = `${id}_grader_${graderIndex++}`;
        const inputId = `${id}_input_${inputIndex++}`;

        let answer, tolerance;
        if (block.range) {
          // Range: use midpoint as answer with tolerance
          answer = ((block.range.min + block.range.max) / 2).toString();
          tolerance = ((block.range.max - block.range.min) / 2).toString();
        } else {
          answer = block.value.toString();
          tolerance = block.tolerance?.toString();
        }

        storeEntry(inputId, {
          id: inputId,
          tag: 'NumberInput',
          attributes: { id: inputId },
          kids: []
        });

        storeEntry(graderId, {
          id: graderId,
          tag: 'NumericalGrader',
          attributes: {
            id: graderId,
            answer,
            ...(tolerance && { tolerance }),
            target: inputId
          },
          kids: [{ type: 'block', id: inputId }]
        });

        problemKids.push({ type: 'block', id: graderId });
        break;
      }

      case 'dropdown': {
        // Inline dropdown - DropdownInput with KeyGrader
        // TODO: Handle inline dropdowns in questions
        break;
      }

      case 'hint': {
        // Single hint - becomes Explanation or similar
        const hintId = `${id}_hint_${hintIndex++}`;
        storeEntry(hintId, {
          id: hintId,
          tag: 'Markdown',
          attributes: { id: hintId, class: 'hint' },
          kids: `💡 ${block.content}`
        });
        problemKids.push({ type: 'block', id: hintId });
        break;
      }

      case 'demandHints': {
        // Progressive demand hints
        block.hints.forEach((hint, i) => {
          const hintId = `${id}_demand_hint_${i}`;
          storeEntry(hintId, {
            id: hintId,
            tag: 'Markdown',
            attributes: { id: hintId },
            kids: hint
          });
          demandHints.push({ type: 'block', id: hintId });
        });
        break;
      }

      case 'explanation': {
        // Explanation block - shown after correct answer
        // Wrap content in Markdown for proper rendering
        const explId = `${id}_explanation_${contentIndex++}`;
        const explContentId = `${explId}_content`;
        storeEntry(explContentId, {
          id: explContentId,
          tag: 'Markdown',
          attributes: { id: explContentId },
          kids: block.content
        });
        storeEntry(explId, {
          id: explId,
          tag: 'Explanation',
          attributes: { id: explId },
          kids: [{ type: 'block', id: explContentId }]
        });
        problemKids.push({ type: 'block', id: explId });
        break;
      }

      case 'separator': {
        // Question separator - could start a new sub-problem
        // For now, just add a visual separator
        const sepId = `${id}_sep_${contentIndex++}`;
        storeEntry(sepId, {
          id: sepId,
          tag: 'Markdown',
          attributes: { id: sepId },
          kids: '---'
        });
        problemKids.push({ type: 'block', id: sepId });
        break;
      }

      default:
        console.warn(`MarkupProblem: Unknown block type: ${block.type}`);
    }
  }

  // Add DemandHints if any
  if (demandHints.length > 0) {
    const demandHintsId = `${id}_demand_hints`;
    storeEntry(demandHintsId, {
      id: demandHintsId,
      tag: 'DemandHints',
      attributes: { id: demandHintsId },
      kids: demandHints
    });
    problemKids.push({ type: 'block', id: demandHintsId });
  }

  // Store CapaProblem
  storeEntry(problemId, {
    id: problemId,
    tag: 'CapaProblem',
    attributes: {
      id: problemId,
      ...attributes
    },
    kids: problemKids
  });

  return [{ type: 'block', id: problemId }];
}

export const fields = state.fields([]);

const MarkupProblem = dev({
  ...peggyParser(capaParser, {
    postprocess: generateProblemComponents,
    skipStoreEntry: false
  }),
  name: 'MarkupProblem',
  description: 'Simple markup language for authoring problems - expands to CapaProblem with graders and inputs',
  component: _Noop,
  fields
});

export default MarkupProblem;
