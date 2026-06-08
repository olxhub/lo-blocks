// packages/shared/components/blocks/MarkupProblem/MarkupProblem.ts
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
import { srcAttributes, problemAttributes } from '@/lib/blocks/attributeSchemas';
import * as capaParser from '../specialized/peg_prototype/_capaParser';
import _CapaProblem from '@/components/blocks/CapaProblem/_CapaProblem';
import type { KidEntry, DefinitionRef } from '@/lib/types';
import { splitNs, asDefinitionRef, joinDefinitionRef, parseLeafId } from '@/lib/types/id-grammar';
import { parse as parseExpr } from '@/lib/stateLanguage';

// Pre-parse a when= expression into the { expr, ast } shape that useKidsJson expects.
// storeEntry stores raw attributes, bypassing the z_expression Zod transform,
// so we must do the transform ourselves.
const whenExpr = (expr: string) => ({ expr, ast: parseExpr(expr) });

// Escape a string for interpolation into a single-quoted expression string.
// Must handle backslashes first (so we don't double-escape), then single quotes,
// then newlines/carriage returns (which would break the expression parser).
const escapeExprString = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');

// Typed child-role suffixes for joinDefinitionRef.
// Validated once at import time so typos are caught early.
const HEADER       = parseLeafId('header');
const P            = parseLeafId('p');
const QUESTION     = parseLeafId('question');
const QTEXT        = parseLeafId('qtext');
const GRADER       = parseLeafId('grader');
const INPUT        = parseLeafId('input');
const CHOICE       = parseLeafId('choice');
const CHECKBOX     = parseLeafId('checkbox');
const MD           = parseLeafId('md');
const FB           = parseLeafId('fb');
const MATCH        = parseLeafId('match');
const DEFAULT      = parseLeafId('default');
const HINT         = parseLeafId('hint');
const DEMAND_HINT  = parseLeafId('demandHint');
const DEMAND_HINTS = parseLeafId('demandHints');
const EXPLANATION  = parseLeafId('explanation');
const CONTENT      = parseLeafId('content');
const SEP          = parseLeafId('sep');

// Helper: create a block kid entry from a DefinitionRef.
const blockRef = (id: DefinitionRef): KidEntry => ({ type: 'block', id });

/**
 * Transform parsed CAPA AST into OLX component structure.
 * Returns graders, inputs, and content as direct children of MarkupProblem.
 */
function generateProblemComponents({ parsed, storeEntry, id, attributes }) {
  // Parent ref for building child IDs via joinDefinitionRef.
  // Expressions (@ref syntax) also need bare IDs since the expression parser
  // doesn't understand namespace syntax.
  const parentRef = asDefinitionRef(splitNs(id).path);
  let graderIndex = 0;
  let inputIndex = 0;
  let hintIndex = 0;
  let contentIndex = 0;

  const problemKids: KidEntry[] = [];
  const demandHints: KidEntry[] = [];

  for (const block of parsed) {
    switch (block.type) {
      case 'h3': {
        // Header becomes Markdown
        const headerId = joinDefinitionRef(parentRef, HEADER, contentIndex++);
        storeEntry(headerId, {
          id: headerId,
          tag: 'Markdown',
          attributes: { id: headerId },
          kids: `### ${block.content}`
        });
        problemKids.push(blockRef(headerId));
        break;
      }

      case 'p': {
        // Paragraph becomes Markdown
        const pId = joinDefinitionRef(parentRef, P, contentIndex++);
        storeEntry(pId, {
          id: pId,
          tag: 'Markdown',
          attributes: { id: pId },
          kids: block.content
        });
        problemKids.push(blockRef(pId));
        break;
      }

      case 'question': {
        // Question label can be a string or array with inline dropdowns
        if (typeof block.label === 'string') {
          // Simple question without dropdowns
          const qId = joinDefinitionRef(parentRef, QUESTION, contentIndex++);
          storeEntry(qId, {
            id: qId,
            tag: 'Markdown',
            attributes: { id: qId },
            kids: `**${block.label}**`
          });
          problemKids.push(blockRef(qId));
        } else {
          // Question with inline dropdowns - handle each part
          const parts = block.label;
          const questionKids: KidEntry[] = [];
          let textBuffer = '';

          for (const part of parts) {
            if (typeof part === 'string') {
              textBuffer += part;
            } else if (part.type === 'dropdown') {
              // Flush text buffer as Markdown
              if (textBuffer.trim()) {
                const textId = joinDefinitionRef(parentRef, QTEXT, contentIndex++);
                storeEntry(textId, {
                  id: textId,
                  tag: 'Markdown',
                  attributes: { id: textId },
                  kids: textBuffer
                });
                questionKids.push(blockRef(textId));
                textBuffer = '';
              }

              // Create KeyGrader with DropdownInput for inline dropdown
              const graderId = joinDefinitionRef(parentRef, GRADER, graderIndex++);
              const inputId = joinDefinitionRef(parentRef, INPUT, inputIndex++);

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

              questionKids.push(blockRef(graderId));
            }
          }

          // Flush any remaining text
          if (textBuffer.trim()) {
            const textId = joinDefinitionRef(parentRef, QTEXT, contentIndex++);
            storeEntry(textId, {
              id: textId,
              tag: 'Markdown',
              attributes: { id: textId },
              kids: textBuffer
            });
            questionKids.push(blockRef(textId));
          }

          // Add all question kids to problem
          questionKids.forEach(kid => problemKids.push(kid));
        }
        break;
      }

      case 'choices': {
        // Multiple choice - KeyGrader with ChoiceInput
        // Grammar outputs { text, value, tag: 'Key'/'Distractor', feedback? } directly
        const graderId = joinDefinitionRef(parentRef, GRADER, graderIndex++);
        const inputId = joinDefinitionRef(parentRef, INPUT, inputIndex++);

        const choiceKids = block.options.map((opt, i) => {
          const choiceId = joinDefinitionRef(parentRef, CHOICE, inputIndex - 1, i);
          const choiceMdId = joinDefinitionRef(choiceId, MD);
          storeEntry(choiceMdId, {
            id: choiceMdId,
            tag: 'Markdown',
            attributes: { id: choiceMdId },
            kids: opt.text
          });
          storeEntry(choiceId, {
            id: choiceId,
            tag: opt.tag,
            attributes: { id: choiceId, value: opt.text },
            kids: [{ type: 'block', id: choiceMdId }]
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

        problemKids.push(blockRef(graderId));

        // Per-choice feedback: {{ hint text }} shows based on submitted answer
        for (let oi = 0; oi < block.options.length; oi++) {
          const opt = block.options[oi];
          if (!opt.feedback) continue;
          const escaped = escapeExprString(opt.text);
          const fbId = joinDefinitionRef(parentRef, FB, inputIndex - 1, oi);
          storeEntry(fbId, {
            id: fbId,
            tag: 'Markdown',
            attributes: { id: fbId, when: whenExpr(`@${graderId}.lastSubmission ? (@${graderId}.lastSubmission).includes('${escaped}') : false`) },
            kids: opt.feedback
          });
          problemKids.push(blockRef(fbId));
        }

        break;
      }

      case 'checkboxes': {
        // Checkboxes - multi-select using CheckboxInput and CheckboxGrader
        // Grammar outputs { text, value, tag: 'Key'/'Distractor', feedback? } directly
        const graderId = joinDefinitionRef(parentRef, GRADER, graderIndex++);
        const inputId = joinDefinitionRef(parentRef, INPUT, inputIndex++);

        const choiceKids = block.options.map((opt, i) => {
          const choiceId = joinDefinitionRef(parentRef, CHECKBOX, inputIndex - 1, i);
          const choiceMdId = joinDefinitionRef(choiceId, MD);
          storeEntry(choiceMdId, {
            id: choiceMdId,
            tag: 'Markdown',
            attributes: { id: choiceMdId },
            kids: opt.text
          });
          storeEntry(choiceId, {
            id: choiceId,
            tag: opt.tag,
            attributes: { id: choiceId, value: opt.text },
            kids: [{ type: 'block', id: choiceMdId }]
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
        // Inline type: graderMixin contributes target/answer/displayAnswer at factory time,
        // but here we're emitting raw OLX attributes, so target is a single string.
        const graderAttrs: { id: string; target: string; partialCredit?: 'true' | 'false' } = {
          id: graderId,
          target: inputId,
        };
        if (block.partialCredit) {
          graderAttrs.partialCredit = 'true';
        }
        storeEntry(graderId, {
          id: graderId,
          tag: 'CheckboxGrader',
          attributes: graderAttrs,
          kids: [{ type: 'block', id: inputId }]
        });

        problemKids.push(blockRef(graderId));

        // Per-choice feedback for checkboxes: shows based on submitted answer
        for (let oi = 0; oi < block.options.length; oi++) {
          const opt = block.options[oi];
          if (!opt.feedback) continue;
          const escaped = escapeExprString(opt.text);
          const fbId = joinDefinitionRef(parentRef, FB, inputIndex - 1, oi);
          storeEntry(fbId, {
            id: fbId,
            tag: 'Markdown',
            attributes: { id: fbId, when: whenExpr(`@${graderId}.lastSubmission ? (@${graderId}.lastSubmission).flat().includes('${escaped}') : false`) },
            kids: opt.feedback
          });
          problemKids.push(blockRef(fbId));
        }

        break;
      }

      case 'textInput': {
        // Text input - RulesGrader with StringMatch rules
        // Grammar outputs rules array: [{ answer, score, feedback }, ...]
        const graderId = joinDefinitionRef(parentRef, GRADER, graderIndex++);
        const inputId = joinDefinitionRef(parentRef, INPUT, inputIndex++);

        const matchKids: KidEntry[] = [];

        // Create StringMatch for each rule from grammar
        block.rules.forEach((rule, i) => {
          const matchId = joinDefinitionRef(parentRef, MATCH, graderIndex - 1, i);
          storeEntry(matchId, {
            id: matchId,
            tag: 'StringMatch',
            attributes: {
              id: matchId,
              answer: rule.answer,
              score: rule.score,
              feedback: rule.feedback
            },
            kids: []
          });
          matchKids.push(blockRef(matchId));
        });

        // Default catch-all
        const defaultMatchId = joinDefinitionRef(parentRef, MATCH, graderIndex - 1, DEFAULT);
        storeEntry(defaultMatchId, {
          id: defaultMatchId,
          tag: 'DefaultMatch',
          attributes: {
            id: defaultMatchId,
            score: 0,
            feedback: 'Try again'
          },
          kids: []
        });
        matchKids.push(blockRef(defaultMatchId));

        // Store LineInput
        storeEntry(inputId, {
          id: inputId,
          tag: 'LineInput',
          attributes: { id: inputId },
          kids: []
        });
        matchKids.push(blockRef(inputId));

        // Store RulesGrader
        storeEntry(graderId, {
          id: graderId,
          tag: 'RulesGrader',
          attributes: { id: graderId },
          kids: matchKids
        });

        problemKids.push(blockRef(graderId));
        break;
      }

      case 'numericalInput': {
        // Numerical input - NumericalGrader
        const graderId = joinDefinitionRef(parentRef, GRADER, graderIndex++);
        const inputId = joinDefinitionRef(parentRef, INPUT, inputIndex++);

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

        problemKids.push(blockRef(graderId));
        break;
      }

      case 'dropdown': {
        // Standalone dropdown - KeyGrader with DropdownInput
        const graderId = joinDefinitionRef(parentRef, GRADER, graderIndex++);
        const inputId = joinDefinitionRef(parentRef, INPUT, inputIndex++);

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

        problemKids.push(blockRef(graderId));
        break;
      }

      case 'hint': {
        // Single hint - add to demand hints (revealed on request)
        const hintId = joinDefinitionRef(parentRef, HINT, hintIndex++);
        storeEntry(hintId, {
          id: hintId,
          tag: 'Markdown',
          attributes: { id: hintId },
          kids: block.content
        });
        demandHints.push(blockRef(hintId));
        break;
      }

      case 'demandHints': {
        // Progressive demand hints
        block.hints.forEach((hint, i) => {
          const hintId = joinDefinitionRef(parentRef, DEMAND_HINT, i);
          storeEntry(hintId, {
            id: hintId,
            tag: 'Markdown',
            attributes: { id: hintId },
            kids: hint
          });
          demandHints.push(blockRef(hintId));
        });
        break;
      }

      case 'explanation': {
        // Explanation block - shown after correct answer
        // Wrap content in Markdown for proper rendering
        const explId = joinDefinitionRef(parentRef, EXPLANATION, contentIndex++);
        const explContentId = joinDefinitionRef(explId, CONTENT);
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
        problemKids.push(blockRef(explId));
        break;
      }

      case 'separator': {
        // Question separator - could start a new sub-problem
        // For now, just add a visual separator
        const sepId = joinDefinitionRef(parentRef, SEP, contentIndex++);
        storeEntry(sepId, {
          id: sepId,
          tag: 'Markdown',
          attributes: { id: sepId },
          kids: '---'
        });
        problemKids.push(blockRef(sepId));
        break;
      }

      default:
        console.warn(`MarkupProblem: Unknown block type: ${block.type}`);
    }
  }

  // Add DemandHints if any
  if (demandHints.length > 0) {
    const demandHintsId = joinDefinitionRef(parentRef, DEMAND_HINTS);
    storeEntry(demandHintsId, {
      id: demandHintsId,
      tag: 'DemandHints',
      attributes: { id: demandHintsId },
      kids: demandHints
    });
    problemKids.push(blockRef(demandHintsId));
  }

  return problemKids;
}

export const fields = state.fields(state.graderFields());

const MarkupProblem = dev({
  ...peggyParser(capaParser, {
    postprocess: generateProblemComponents,
    skipStoreEntry: false
  }),
  name: 'MarkupProblem',
  category: 'CAPA Problems',
  description: 'Simple markup language for authoring problems - expands to CapaProblem with graders and inputs',
  component: _CapaProblem,
  fields,
  isGrader: true,  // Metagrader: aggregates child grader states (same as CapaProblem)
  attributes: srcAttributes.extend(problemAttributes.shape).strict(),
  // peggyParser sets staticKids: () => [], but MarkupProblem generates child
  // blocks (graders, inputs, hints) dynamically during PEG parsing.
  // Without this, the content API's static-kids mode won't include them.
  staticKids: (entry: any) => {
    if (!Array.isArray(entry?.kids)) return [];
    return entry.kids.filter((k: any) => k?.id).map((k: any) => k.id);
  },
});

export default MarkupProblem;
