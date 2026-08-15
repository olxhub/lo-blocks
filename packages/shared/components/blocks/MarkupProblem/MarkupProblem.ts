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
import { blockReference, peggyParser, directKidDefinitionKeys } from '@/lib/content/parsers';
import { srcAttributes, problemAttributes } from '@/lib/blocks/attributeSchemas';
import { gradingSelectors, problemGradeMode } from '@/lib/grading';
import * as capaParser from '../specialized/peg_prototype/_capaParser';
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

/**
 * Transform parsed CAPA AST into OLX component structure.
 * Returns graders, inputs, and content as direct children of MarkupProblem.
 */
function generateProblemComponents({ parsed, storeEntry, definitionKey, attributes }) {
  // Parent ref for building child DefinitionRefs via joinDefinitionRef.
  // Expressions (@ref syntax) also need bare IDs since the expression parser
  // doesn't understand namespace syntax.
  const parentRef = asDefinitionRef(splitNs(definitionKey).path);
  const ns = splitNs(definitionKey).ns;
  const blockRef = (definitionRef: DefinitionRef): KidEntry => blockReference(definitionRef, ns);
  // Every generated grader is a boundary grader of this problem — stamp the
  // problem's grading mode on each (same parse-time convention as capaParser;
  // grading derivation reads it via gradeModeOf, never the dynamic DOM).
  const gradeMode = problemGradeMode(attributes);
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
        const headerRef = joinDefinitionRef(parentRef, HEADER, contentIndex++);
        storeEntry(headerRef, {
          id: headerRef,
          tag: 'Markdown',
          attributes: { id: headerRef },
          kids: `### ${block.content}`
        });
        problemKids.push(blockRef(headerRef));
        break;
      }

      case 'p': {
        // Paragraph becomes Markdown
        const pRef = joinDefinitionRef(parentRef, P, contentIndex++);
        storeEntry(pRef, {
          id: pRef,
          tag: 'Markdown',
          attributes: { id: pRef },
          kids: block.content
        });
        problemKids.push(blockRef(pRef));
        break;
      }

      case 'question': {
        // Question label can be a string or array with inline dropdowns
        if (typeof block.label === 'string') {
          // Simple question without dropdowns
          const qRef = joinDefinitionRef(parentRef, QUESTION, contentIndex++);
          storeEntry(qRef, {
            id: qRef,
            tag: 'Markdown',
            attributes: { id: qRef },
            kids: `**${block.label}**`
          });
          problemKids.push(blockRef(qRef));
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
                const textRef = joinDefinitionRef(parentRef, QTEXT, contentIndex++);
                storeEntry(textRef, {
                  id: textRef,
                  tag: 'Markdown',
                  attributes: { id: textRef },
                  kids: textBuffer
                });
                questionKids.push(blockRef(textRef));
                textBuffer = '';
              }

              // Create KeyGrader with DropdownInput for inline dropdown
              const graderRef = joinDefinitionRef(parentRef, GRADER, graderIndex++);
              const inputRef = joinDefinitionRef(parentRef, INPUT, inputIndex++);

              // Store DropdownInput with pre-parsed options (grammar outputs DropdownInput format directly)
              storeEntry(inputRef, {
                id: inputRef,
                tag: 'DropdownInput',
                attributes: { id: inputRef, placeholder: 'Select...' },
                kids: { type: 'parsed', parsed: { options: part.options } }
              });

              // Store KeyGrader wrapping the DropdownInput
              storeEntry(graderRef, {
                id: graderRef,
                tag: 'KeyGrader',
                attributes: { id: graderRef, target: inputRef, gradeMode },
                kids: [blockRef(inputRef)]
              });

              questionKids.push(blockRef(graderRef));
            }
          }

          // Flush any remaining text
          if (textBuffer.trim()) {
            const textRef = joinDefinitionRef(parentRef, QTEXT, contentIndex++);
            storeEntry(textRef, {
              id: textRef,
              tag: 'Markdown',
              attributes: { id: textRef },
              kids: textBuffer
            });
            questionKids.push(blockRef(textRef));
          }

          // Add all question kids to problem
          questionKids.forEach(kid => problemKids.push(kid));
        }
        break;
      }

      case 'choices': {
        // Multiple choice - KeyGrader with ChoiceInput
        // Grammar outputs { text, value, tag: 'Key'/'Distractor', feedback? } directly
        const graderRef = joinDefinitionRef(parentRef, GRADER, graderIndex++);
        const inputRef = joinDefinitionRef(parentRef, INPUT, inputIndex++);

        const choiceKids = block.options.map((opt, i) => {
          const choiceRef = joinDefinitionRef(parentRef, CHOICE, inputIndex - 1, i);
          const choiceMdRef = joinDefinitionRef(choiceRef, MD);
          storeEntry(choiceMdRef, {
            id: choiceMdRef,
            tag: 'Markdown',
            attributes: { id: choiceMdRef },
            kids: opt.text
          });
          storeEntry(choiceRef, {
            id: choiceRef,
            tag: opt.tag,
            attributes: { id: choiceRef, value: opt.text },
            kids: [blockRef(choiceMdRef)]
          });
          return blockRef(choiceRef);
        });

        // Store ChoiceInput
        storeEntry(inputRef, {
          id: inputRef,
          tag: 'ChoiceInput',
          attributes: { id: inputRef },
          kids: choiceKids
        });

        // Store KeyGrader
        storeEntry(graderRef, {
          id: graderRef,
          tag: 'KeyGrader',
          attributes: { id: graderRef, target: inputRef, gradeMode },
          kids: [blockRef(inputRef)]
        });

        problemKids.push(blockRef(graderRef));

        // Per-choice feedback: {{ hint text }} shows based on submitted answer
        for (let oi = 0; oi < block.options.length; oi++) {
          const opt = block.options[oi];
          if (!opt.feedback) continue;
          const escaped = escapeExprString(opt.text);
          const fbRef = joinDefinitionRef(parentRef, FB, inputIndex - 1, oi);
          storeEntry(fbRef, {
            id: fbRef,
            tag: 'Markdown',
            attributes: { id: fbRef, when: whenExpr(`@${graderRef}.lastSubmission ? (@${graderRef}.lastSubmission).includes('${escaped}') : false`) },
            kids: opt.feedback
          });
          problemKids.push(blockRef(fbRef));
        }

        break;
      }

      case 'checkboxes': {
        // Checkboxes - multi-select using CheckboxInput and CheckboxGrader
        // Grammar outputs { text, value, tag: 'Key'/'Distractor', feedback? } directly
        const graderRef = joinDefinitionRef(parentRef, GRADER, graderIndex++);
        const inputRef = joinDefinitionRef(parentRef, INPUT, inputIndex++);

        const choiceKids = block.options.map((opt, i) => {
          const choiceRef = joinDefinitionRef(parentRef, CHECKBOX, inputIndex - 1, i);
          const choiceMdRef = joinDefinitionRef(choiceRef, MD);
          storeEntry(choiceMdRef, {
            id: choiceMdRef,
            tag: 'Markdown',
            attributes: { id: choiceMdRef },
            kids: opt.text
          });
          storeEntry(choiceRef, {
            id: choiceRef,
            tag: opt.tag,
            attributes: { id: choiceRef, value: opt.text },
            kids: [blockRef(choiceMdRef)]
          });
          return blockRef(choiceRef);
        });

        // CheckboxInput for multi-select (value is array)
        storeEntry(inputRef, {
          id: inputRef,
          tag: 'CheckboxInput',
          attributes: { id: inputRef },
          kids: choiceKids
        });

        // CheckboxGrader - optionally add partialCredit="true" if block specifies it
        // Inline type: graderMixin contributes target/answer/displayAnswer at factory time,
        // but here we're emitting raw OLX attributes, so target is a single string.
        const graderAttrs: { id: string; target: string; gradeMode: string; partialCredit?: 'true' | 'false' } = {
          id: graderRef,
          target: inputRef,
          gradeMode,
        };
        if (block.partialCredit) {
          graderAttrs.partialCredit = 'true';
        }
        storeEntry(graderRef, {
          id: graderRef,
          tag: 'CheckboxGrader',
          attributes: graderAttrs,
          kids: [blockRef(inputRef)]
        });

        problemKids.push(blockRef(graderRef));

        // Per-choice feedback for checkboxes: shows based on submitted answer
        for (let oi = 0; oi < block.options.length; oi++) {
          const opt = block.options[oi];
          if (!opt.feedback) continue;
          const escaped = escapeExprString(opt.text);
          const fbRef = joinDefinitionRef(parentRef, FB, inputIndex - 1, oi);
          storeEntry(fbRef, {
            id: fbRef,
            tag: 'Markdown',
            attributes: { id: fbRef, when: whenExpr(`@${graderRef}.lastSubmission ? (@${graderRef}.lastSubmission).flat().includes('${escaped}') : false`) },
            kids: opt.feedback
          });
          problemKids.push(blockRef(fbRef));
        }

        break;
      }

      case 'textInput': {
        // Text input - RulesGrader with StringMatch rules
        // Grammar outputs rules array: [{ answer, score, feedback }, ...]
        const graderRef = joinDefinitionRef(parentRef, GRADER, graderIndex++);
        const inputRef = joinDefinitionRef(parentRef, INPUT, inputIndex++);

        const matchKids: KidEntry[] = [];

        // Create StringMatch for each rule from grammar
        block.rules.forEach((rule, i) => {
          const matchRef = joinDefinitionRef(parentRef, MATCH, graderIndex - 1, i);
          storeEntry(matchRef, {
            id: matchRef,
            tag: 'StringMatch',
            attributes: {
              id: matchRef,
              answer: rule.answer,
              score: rule.score,
              feedback: rule.feedback
            },
            kids: []
          });
          matchKids.push(blockRef(matchRef));
        });

        // Default catch-all
        const defaultMatchRef = joinDefinitionRef(parentRef, MATCH, graderIndex - 1, DEFAULT);
        storeEntry(defaultMatchRef, {
          id: defaultMatchRef,
          tag: 'DefaultMatch',
          attributes: {
            id: defaultMatchRef,
            score: 0,
            feedback: 'Try again'
          },
          kids: []
        });
        matchKids.push(blockRef(defaultMatchRef));

        // Store LineInput
        storeEntry(inputRef, {
          id: inputRef,
          tag: 'LineInput',
          attributes: { id: inputRef },
          kids: []
        });
        matchKids.push(blockRef(inputRef));

        // Store RulesGrader
        storeEntry(graderRef, {
          id: graderRef,
          tag: 'RulesGrader',
          attributes: { id: graderRef, gradeMode },
          kids: matchKids
        });

        problemKids.push(blockRef(graderRef));
        break;
      }

      case 'numericalInput': {
        // Numerical input - NumericalGrader
        const graderRef = joinDefinitionRef(parentRef, GRADER, graderIndex++);
        const inputRef = joinDefinitionRef(parentRef, INPUT, inputIndex++);

        let answer, tolerance;
        if (block.range) {
          // Range: use midpoint as answer with tolerance
          answer = ((block.range.min + block.range.max) / 2).toString();
          tolerance = ((block.range.max - block.range.min) / 2).toString();
        } else {
          answer = block.value.toString();
          tolerance = block.tolerance?.toString();
        }

        storeEntry(inputRef, {
          id: inputRef,
          tag: 'NumberInput',
          attributes: { id: inputRef },
          kids: []
        });

        storeEntry(graderRef, {
          id: graderRef,
          tag: 'NumericalGrader',
          attributes: {
            id: graderRef,
            answer,
            ...(tolerance && { tolerance }),
            target: inputRef,
            gradeMode,
          },
          kids: [blockRef(inputRef)]
        });

        problemKids.push(blockRef(graderRef));
        break;
      }

      case 'dropdown': {
        // Standalone dropdown - KeyGrader with DropdownInput
        const graderRef = joinDefinitionRef(parentRef, GRADER, graderIndex++);
        const inputRef = joinDefinitionRef(parentRef, INPUT, inputIndex++);

        // Store DropdownInput with pre-parsed options (grammar outputs DropdownInput format directly)
        storeEntry(inputRef, {
          id: inputRef,
          tag: 'DropdownInput',
          attributes: { id: inputRef, placeholder: 'Select...' },
          kids: { type: 'parsed', parsed: { options: block.options } }
        });

        // Store KeyGrader wrapping the DropdownInput
        storeEntry(graderRef, {
          id: graderRef,
          tag: 'KeyGrader',
          attributes: { id: graderRef, target: inputRef, gradeMode },
          kids: [blockRef(inputRef)]
        });

        problemKids.push(blockRef(graderRef));
        break;
      }

      case 'hint': {
        // Single hint - add to demand hints (revealed on request)
        const hintRef = joinDefinitionRef(parentRef, HINT, hintIndex++);
        storeEntry(hintRef, {
          id: hintRef,
          tag: 'Markdown',
          attributes: { id: hintRef },
          kids: block.content
        });
        demandHints.push(blockRef(hintRef));
        break;
      }

      case 'demandHints': {
        // Progressive demand hints
        block.hints.forEach((hint, i) => {
          const hintRef = joinDefinitionRef(parentRef, DEMAND_HINT, i);
          storeEntry(hintRef, {
            id: hintRef,
            tag: 'Markdown',
            attributes: { id: hintRef },
            kids: hint
          });
          demandHints.push(blockRef(hintRef));
        });
        break;
      }

      case 'explanation': {
        // Explanation block - shown after correct answer
        // Wrap content in Markdown for proper rendering
        const explRef = joinDefinitionRef(parentRef, EXPLANATION, contentIndex++);
        const explContentRef = joinDefinitionRef(explRef, CONTENT);
        storeEntry(explContentRef, {
          id: explContentRef,
          tag: 'Markdown',
          attributes: { id: explContentRef },
          kids: block.content
        });
        storeEntry(explRef, {
          id: explRef,
          tag: 'Explanation',
          attributes: { id: explRef },
          kids: [blockRef(explContentRef)]
        });
        problemKids.push(blockRef(explRef));
        break;
      }

      case 'separator': {
        // Question separator - could start a new sub-problem
        // For now, just add a visual separator
        const sepRef = joinDefinitionRef(parentRef, SEP, contentIndex++);
        storeEntry(sepRef, {
          id: sepRef,
          tag: 'Markdown',
          attributes: { id: sepRef },
          kids: '---'
        });
        problemKids.push(blockRef(sepRef));
        break;
      }

      default:
        console.warn(`MarkupProblem: Unknown block type: ${block.type}`);
    }
  }

  // Add DemandHints if any
  if (demandHints.length > 0) {
    const demandHintsRef = joinDefinitionRef(parentRef, DEMAND_HINTS);
    storeEntry(demandHintsRef, {
      id: demandHintsRef,
      tag: 'DemandHints',
      attributes: { id: demandHintsRef },
      kids: demandHints
    });
    problemKids.push(blockRef(demandHintsRef));
  }

  return problemKids;
}

// Metagrader like CapaProblem: aggregate grading state is derived on read
// (lib/grading/selectGradingState.ts), not stored. Only showAnswer is real state.
export const fields = state.fields([state.commonFields.showAnswer]);

const MarkupProblem = dev({
  ...peggyParser(capaParser, {
    postprocess: generateProblemComponents,
    skipStoreEntry: false
  }),
  name: 'MarkupProblem',
  category: 'CAPA Problems',
  description: 'Simple markup language for authoring problems - expands to CapaProblem with graders and inputs',
  // Non-conventional: MarkupProblem expands to CapaProblem's structure, so it reuses
  // CapaProblem's renderer rather than having its own sibling component file.
  componentLoader: () => import('@/components/blocks/CapaProblem/_CapaProblem').then(m => m.default),
  fields,
  isGrader: true,  // Metagrader: aggregates child grader states (same as CapaProblem)
  selectors: gradingSelectors,
  attributes: srcAttributes.extend(problemAttributes.shape).strict(),
  // peggyParser sets staticKids: () => [], but MarkupProblem generates child
  // blocks (graders, inputs, hints) dynamically during PEG parsing. Without a
  // staticKids that reports them, the content API's static-kids serving mode
  // won't ship them and the client renders "Block <id> not found in content".
  staticKids: directKidDefinitionKeys,
});

export default MarkupProblem;
