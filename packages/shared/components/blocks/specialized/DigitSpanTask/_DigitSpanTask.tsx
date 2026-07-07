// packages/shared/components/blocks/specialized/DigitSpanTask/_DigitSpanTask.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useEffect } from 'react';
import { useFieldState } from '@/lib/state';
import { DisplayError } from '@/lib/util/debug';
import { useBlockTranslation } from '@/lib/i18n/blockI18n';


export default function DigitSpanTask( props: RuntimeProps ) {
  const { id, kids = [], attributes = {}, fields } = props;
  const { t } = useBlockTranslation(props);
  const mode = attributes.mode ?? 'forward'; // 'forward' | 'backward' | 'ascending'

  const [sequence, setSequence] = useFieldState(props, fields.sequence, []);
  const [userInput, setUserInput] = useFieldState(props, fields.userInput, '');
  const [step, setStep] = useFieldState(props, fields.step, 'waiting'); // 'waiting' | 'playing' | 'answering' | 'feedback'
  const [theta, setTheta] = useFieldState(props, fields.theta, 0); // Ability estimate
  const [difficulty, setDifficulty] = useFieldState(props, fields.difficulty, 3); // Starting sequence length (proxy for difficulty)
  useEffect(() => {
    if (step === 'playing') {
      playSequence();
    }
  // playSequence is intentionally omitted to avoid re-render loops, so we need
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sequence]);

  function generateSequence(length) {
    return Array.from({ length }, () => Math.floor(Math.random() * 9) + 1);
  }

  async function playSequence() {
    for (let num of sequence) {
      const utter = new SpeechSynthesisUtterance(num.toString());
      speechSynthesis.speak(utter);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    setStep('answering');
  }

  function startNewRound() {
    setSequence(generateSequence(difficulty));
    setUserInput('');
    setStep('playing');
  }

  function evaluateAnswer() {
    let expected = [...sequence];

    if (mode === 'backward') {
      expected = expected.slice().reverse();
    } else if (mode === 'ascending') {
      expected = expected.slice().sort((a, b) => a - b);
    }

    const normalizedInput = userInput.replace(/\s+/g, '').split('').map(Number);
    const correct = JSON.stringify(normalizedInput) === JSON.stringify(expected);

    // Update ability estimate (simple logistic model)
    const itemDifficulty = dummyDifficultyForLength(sequence.length);
    const delta = correct ? 0.2 : -0.2; // simple step size
    setTheta(prev => prev + delta);

    // Adjust sequence length based on updated theta
    const newDifficulty = Math.max(2, Math.round(dummyLengthForTheta(theta + delta)));
    setDifficulty(newDifficulty);

    setStep('feedback');
  }

  function dummyDifficultyForLength(length) {
    // Dummy mapping: longer sequence = harder
    return 0.2 * (length - 2); // Easy: 2 digits → difficulty 0.0, 3 digits → 0.2, etc.
  }

  function dummyLengthForTheta(theta) {
    // Dummy reverse mapping
    return 2 + Math.max(0, Math.round(theta * 5)); // Roughly: theta 0 → 2 digits, theta 1 → 7 digits
  }

  if (!['forward', 'backward', 'ascending'].includes(mode)) {
    return (
      <DisplayError
        title="DigitSpanTask"
        message="Invalid mode provided. Must be 'forward', 'backward', or 'ascending'."
        technical={`Got mode="${mode}"`}
        data={{ attributes }}
      />
    );
  }

  return (
    <div className="p-6 max-w-md mx-auto space-y-4">

      {step === 'waiting' && (
        <button onClick={startNewRound} className="p-2 bg-accent text-inverse rounded">{t('start')}</button>
      )}

      {step === 'answering' && (
        <div>
          <p>{t('typeDigits')}</p>
          <input
            type="text"
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            className="border p-2 w-full"
          />
          <button onClick={evaluateAnswer} className="p-2 bg-success text-inverse rounded mt-2">{t('submit')}</button>
        </div>
      )}

      {step === 'feedback' && (
        <div>
          <p>{t('answerRecorded', { buttonLabel: t('next') })}</p>
          <button onClick={startNewRound} className="p-2 bg-accent text-inverse rounded">{t('next')}</button>
        </div>
      )}
    </div>
  );
}
