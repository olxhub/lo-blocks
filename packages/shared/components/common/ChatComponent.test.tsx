// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InputFooter } from './ChatComponent';

afterEach(cleanup);

describe('InputFooter', () => {
  it('labels Send and enables it only when there is a message', () => {
    const onSendMessage = vi.fn();
    render(<InputFooter sendLabel="Enviar" onSendMessage={onSendMessage} />);

    const send = screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);

    expect(onSendMessage).toHaveBeenCalledWith('Hello', null);
    expect(send.disabled).toBe(true);
  });

  it('preserves the caller-provided placeholder while disabled', () => {
    render(<InputFooter disabled placeholder="Pat is thinking…" />);
    const input = screen.getByPlaceholderText('Pat is thinking…') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
