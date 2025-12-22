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
        // Question label can be a string or array with inline dropdowns
        if (typeof block.label === 'string') {
          // Simple question without dropdowns
          const qId = `${id}_question_${contentIndex++}`;
          storeEntry(qId, {
            id: qId,
            tag: 'Markdown',
            attributes: { id: qId },
            kids: `**${block.label}**`
          });
          problemKids.push({ type: 'block', id: qId });
        } else {
          // Question with inline dropdowns - handle each part
          const parts = block.label;
          const questionKids = [];
          let textBuffer = '';

          for (const part of parts) {
            if (typeof part === 'string') {
              textBuffer += part;
            } else if (part.type === 'dropdown') {
              // Flush text buffer as Markdown
              if (textBuffer.trim()) {
                const textId = `${id}_qtext_${contentIndex++}`;
                storeEntry(textId, {
                  id: textId,
                  tag: 'Markdown',
                  attributes: { id: textId },
                  kids: textBuffer
                });
                questionKids.push({ type: 'block', id: textId });
                textBuffer = '';
              }

              // Create KeyGrader with DropdownInput for inline dropdown
              const graderId = `${id}_grader_${graderIndex++}`;
              const inputId = `${id}_input_${inputIndex++}`;

              // Store DropdownInput with pre-parsed options (grammar outputs DropdownInput format directly)
              storeEntry(inputId, {
                id: inputId,
                tag: 'DropdownInput',
                attributes: { id: inputId, placeholder: 'Select...' },
                kids: { type: 'parsed', parsed: { options: part.options } }
              });

              // Store KeyGrader wrapping the DropdownInput
              storeEntry(graderId, {
                id: graderId,
                tag: 'KeyGrader',
                attributes: { id: graderId, target: inputId },
                kids: [{ type: 'block', id: inputId }]
              });

              questionKids.push({ type: 'block', id: graderId });
            }
          }

          // Flush any remaining text
          if (textBuffer.trim()) {
            const textId = `${id}_qtext_${contentIndex++}`;
            storeEntry(textId, {
              id: textId,
              tag: 'Markdown',
              attributes: { id: textId },
              kids: textBuffer
            });
            questionKids.push({ type: 'block', id: textId });
          }

          // Add all question kids to problem
          questionKids.forEach(kid => problemKids.push(kid));
        }
        break;
      }

      case 'choices': {
        // Multiple choice - KeyGrader with ChoiceInput
        // Grammar outputs { text, value, tag: 'Key'/'Distractor', feedback? } directly
        const graderId = `${id}_grader_${graderIndex++}`;
        const inputId = `${id}_input_${inputIndex++}`;

        const choiceKids = block.options.map((opt, i) => {
          const choiceId = `${id}_choice_${inputIndex - 1}_${i}`;
          storeEntry(choiceId, {
            id: choiceId,
            tag: opt.tag,
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
        // Checkboxes - multi-select using CheckboxInput and CheckboxGrader
        // Grammar outputs { text, value, tag: 'Key'/'Distractor', feedback? } directly
        const graderId = `${id}_grader_${graderIndex++}`;
        const inputId = `${id}_input_${inputIndex++}`;

        const choiceKids = block.options.map((opt, i) => {
          const choiceId = `${id}_checkbox_${inputIndex - 1}_${i}`;
          storeEntry(choiceId, {
            id: choiceId,
            tag: opt.tag,
            attributes: { id: choiceId },
            kids: opt.text
          });
          return { type: 'block', id: choiceId };
        });

        // CheckboxInput for multi-select (value is array)
        storeEntry(inputId, {
          id: inputId,
          tag: 'CheckboxInput',
          attributes: { id: inputId },
          kids: choiceKids
        });

        // CheckboxGrader - optionally add partialCredit="true" if block specifies it
        const graderAttrs = { id: graderId, target: inputId };
        if (block.partialCredit) {
          graderAttrs.partialCredit = 'true';
        }
        storeEntry(graderId, {
          id: graderId,
          tag: 'CheckboxGrader',
          attributes: graderAttrs,
          kids: [{ type: 'block', id: inputId }]
        });

        problemKids.push({ type: 'block', id: graderId });
        break;
      }

      case 'textInput': {
        // Text input - RulesGrader with StringMatch rules
        // Grammar outputs rules array: [{ answer, score, feedback }, ...]
        const graderId = `${id}_grader_${graderIndex++}`;
        const inputId = `${id}_input_${inputIndex++}`;

        const matchKids = [];

        // Create StringMatch for each rule from grammar
        block.rules.forEach((rule, i) => {
          const matchId = `${id}_match_${graderIndex - 1}_${i}`;
          storeEntry(matchId, {
            id: matchId,
            tag: 'StringMatch',
            attributes: {
              id: matchId,
              answer: rule.answer,
              score: String(rule.score),
              feedback: rule.feedback
            },
            kids: []
          });
          matchKids.push({ type: 'block', id: matchId });
        });

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
        // Standalone dropdown - KeyGrader with DropdownInput
        const graderId = `${id}_grader_${graderIndex++}`;
        const inputId = `${id}_input_${inputIndex++}`;

        // Store DropdownInput with pre-parsed options (grammar outputs DropdownInput format directly)
        storeEntry(inputId, {
          id: inputId,
          tag: 'DropdownInput',
          attributes: { id: inputId, placeholder: 'Select...' },
          kids: { type: 'parsed', parsed: { options: block.options } }
        });

        // Store KeyGrader wrapping the DropdownInput
        storeEntry(graderId, {
          id: graderId,
          tag: 'KeyGrader',
          attributes: { id: graderId, target: inputId },
          kids: [{ type: 'block', id: inputId }]
        });

        problemKids.push({ type: 'block', id: graderId });
        break;
      }

      case 'hint': {
        // Single hint - add to demand hints (revealed on request)
        const hintId = `${id}_hint_${hintIndex++}`;
        storeEntry(hintId, {
          id: hintId,
          tag: 'Markdown',
          attributes: { id: hintId },
          kids: block.content
        });
        demandHints.push({ type: 'block', id: hintId });
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
