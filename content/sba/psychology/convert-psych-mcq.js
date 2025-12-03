#!/usr/bin/env node
// src/scripts/convert-psych-mcq.js
//
// Converts psychology multiple-choice questions from JSON to OLX format.
//
// Usage:
//   npx tsx src/scripts/convert-psych-mcq.js content/sba/psychology/operant-questions.json
//
// Output: Creates an OLX file with CapaProblems wrapped in a Vertical

import fs from 'fs';
import path from 'path';

const ANSWER_OPTIONS = [
  'positive reinforcement',
  'negative reinforcement',
  'positive punishment',
  'negative punishment'
];

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toKebabCase(str) {
  return str.toLowerCase().replace(/\s+/g, '-');
}

function generateProblemId(index, key) {
  // e.g., "operant_001_positive_reinforcement"
  const keySlug = key.replace(/\s+/g, '_');
  return `operant_${String(index + 1).padStart(3, '0')}_${keySlug}`;
}

function questionToOlx(question, index) {
  const { stem, key, explanation } = question;
  const problemId = generateProblemId(index, key);
  const graderId = `${problemId}_grader`;
  const inputId = `${problemId}_input`;

  const choicesXml = ANSWER_OPTIONS.map(option => {
    const optionId = `${problemId}_${toKebabCase(option).replace(/-/g, '_')}`;
    const isKey = option === key;
    const tag = isKey ? 'Key' : 'Distractor';
    // Capitalize first letter
    const label = option.charAt(0).toUpperCase() + option.slice(1);
    return `        <${tag} id="${optionId}">${escapeXml(label)}</${tag}>`;
  }).join('\n');

  // Put explanation in a comment for now (Explanation block not yet implemented)
  const explanationComment = `<!-- Explanation: ${escapeXml(explanation)} -->`;

  const title = `Question ${index + 1}`;

  return `  <CapaProblem id="${problemId}" title="${title}">
    <p>${escapeXml(stem)}</p>
    <KeyGrader id="${graderId}">
      <ChoiceInput id="${inputId}">
${choicesXml}
      </ChoiceInput>
    </KeyGrader>
    ${explanationComment}
  </CapaProblem>`;
}

function convertJsonToOlx(jsonPath) {
  const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
  const questions = JSON.parse(jsonContent);

  const basename = path.basename(jsonPath, '.json');
  const dirname = path.dirname(jsonPath);
  const outputPath = path.join(dirname, `${basename}.olx`);

  const problemsXml = questions.map((q, i) => questionToOlx(q, i)).join('\n\n');

  // Generate ID list for easy copy-paste into MasteryBank
  const idList = questions.map((q, i) => generateProblemId(i, q.key)).join('\n');

  const olxContent = `<!-- Generated from ${path.basename(jsonPath)} -->
<!-- ${questions.length} operant conditioning questions -->
<!--
Problem IDs for MasteryBank:
${idList}
-->

<Vertical id="operant_conditioning_problems" title="Operant Conditioning Practice" launchable="true">
${problemsXml}
</Vertical>
`;

  fs.writeFileSync(outputPath, olxContent);
  console.log(`✅ Generated ${outputPath}`);
  console.log(`   ${questions.length} problems created`);

  // Print distribution
  const distribution = {};
  for (const q of questions) {
    distribution[q.key] = (distribution[q.key] || 0) + 1;
  }
  console.log('   Distribution:');
  for (const [key, count] of Object.entries(distribution).sort()) {
    console.log(`     ${key}: ${count}`);
  }
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: npx tsx src/scripts/convert-psych-mcq.js <json-file>');
  console.log('Example: npx tsx src/scripts/convert-psych-mcq.js content/sba/psychology/operant-questions.json');
  process.exit(1);
}

const jsonPath = args[0];
if (!fs.existsSync(jsonPath)) {
  console.error(`❌ File not found: ${jsonPath}`);
  process.exit(1);
}

convertJsonToOlx(jsonPath);
