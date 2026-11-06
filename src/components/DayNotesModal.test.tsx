import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DayNote } from '../types';
import { DayNotesModal } from './DayNotesModal';

const notes: DayNote[] = [
  { id: 'n1', dayId: 'd', text: 'Older note', color: 'pink', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'n2', dayId: 'd', text: 'Newer note', color: 'mint', createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
];

function renderModal(readOnly: boolean, handlers = { onAdd: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn() }) {
  render(<MantineProvider env="test"><DayNotesModal opened dayLabel="Day 1" notes={notes} readOnly={readOnly} onClose={vi.fn()} {...handlers} /></MantineProvider>);
  return handlers;
}

afterEach(cleanup);

describe('DayNotesModal', () => {
  it('shows notes as sticky cards oldest first with edit and delete controls', () => {
    renderModal(false);
    const cards = screen.getAllByLabelText(/^Note /);
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual(['Note Older note', 'Note Newer note']);
    expect(cards[0].className).toContain('day-note-card--pink');
    expect(cards[1].className).toContain('day-note-card--mint');
    expect(screen.getByRole('button', { name: 'Edit note Older note' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete note Older note' })).toBeTruthy();
  });

  it('adds a note in the chosen colour, then clears the draft and keeps the colour', () => {
    const { onAdd } = renderModal(false);
    const add = screen.getByRole('button', { name: 'Add note' }) as HTMLButtonElement;
    const draft = screen.getByLabelText('New sticky note') as HTMLTextAreaElement;
    expect(add.disabled).toBe(true);

    fireEvent.change(draft, { target: { value: 'Buy SIM' } });
    expect(add.disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'mint note' }));
    expect(screen.getByRole('button', { name: 'mint note' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(add);
    expect(onAdd).toHaveBeenCalledWith('Buy SIM', 'mint');
    expect((screen.getByLabelText('New sticky note') as HTMLTextAreaElement).value).toBe('');
    expect(screen.getByRole('button', { name: 'mint note' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('edits a card in place and keeps the old text when saved blank', () => {
    const { onUpdate } = renderModal(false);
    fireEvent.click(screen.getByRole('button', { name: 'Edit note Older note' }));
    const box = screen.getByLabelText('Note text') as HTMLTextAreaElement;
    expect(box.value).toBe('Older note');

    fireEvent.change(box, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('Older note')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Edit note Older note' }));
    fireEvent.change(screen.getByLabelText('Note text'), { target: { value: 'Updated note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onUpdate).toHaveBeenCalledWith('n1', 'Updated note');
  });

  it('hides editing controls and the composer for viewers', () => {
    renderModal(true);
    expect(screen.queryByLabelText('New sticky note')).toBeNull();
    expect(screen.queryByRole('button', { name: /Edit|Delete|Add note/ })).toBeNull();
    expect(screen.getByText('Older note')).toBeTruthy();
    expect(screen.getAllByLabelText(/^Note /).length).toBe(2);
    expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0);
  });
});
