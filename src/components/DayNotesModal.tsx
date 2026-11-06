import { useEffect, useState } from 'react';
import { Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core';
import { DAY_NOTE_COLORS, type DayNote, type DayNoteColor } from '../types';
import { dayNoteColor } from '../domain/dayNote';

interface DayNotesModalProps {
  opened: boolean;
  dayLabel: string;
  notes: DayNote[];
  readOnly: boolean;
  onClose: () => void;
  onAdd: (text: string, color: DayNoteColor) => void;
  onUpdate: (noteId: string, text: string) => void;
  onDelete: (noteId: string) => void;
}

function stamp(note: DayNote) {
  const created = new Date(note.createdAt).toLocaleString();
  return note.updatedAt !== note.createdAt ? `${created} (edited ${new Date(note.updatedAt).toLocaleString()})` : created;
}

export function DayNotesModal({ opened, dayLabel, notes, readOnly, onClose, onAdd, onUpdate, onDelete }: DayNotesModalProps) {
  const [draft, setDraft] = useState('');
  const [color, setColor] = useState<DayNoteColor>('yellow');
  const ordered = [...notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  function add() {
    if (!draft.trim()) return;
    onAdd(draft, color);
    setDraft('');
  }

  return (
    <Modal opened={opened} onClose={onClose} title={`${dayLabel} notes`} centered>
      <Stack gap="md">
        {ordered.length ? (
          <div className="day-note-grid">
            {ordered.map((note) => <StickyNoteCard key={note.id} note={note} readOnly={readOnly} onUpdate={onUpdate} onDelete={onDelete} />)}
          </div>
        ) : <Text c="dimmed" size="sm">No notes for this day.</Text>}
        {!readOnly ? (
          <Stack gap="xs">
            <Textarea
              label="New sticky note"
              placeholder="e.g. Ask the hotel about late checkout"
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              autosize
              minRows={2}
            />
            <Group justify="space-between">
              <Group gap={6}>
                {DAY_NOTE_COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`day-note-swatch day-note-swatch--${option}`}
                    aria-label={`${option} note`}
                    aria-pressed={color === option}
                    onClick={() => setColor(option)}
                  />
                ))}
              </Group>
              <Button onClick={add} disabled={!draft.trim()}>Add note</Button>
            </Group>
          </Stack>
        ) : null}
      </Stack>
    </Modal>
  );
}

function StickyNoteCard({ note, readOnly, onUpdate, onDelete }: {
  note: DayNote;
  readOnly: boolean;
  onUpdate: (noteId: string, text: string) => void;
  onDelete: (noteId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  useEffect(() => setText(note.text), [note.text]);

  function save() {
    if (text.trim()) {
      if (text.trim() !== note.text) onUpdate(note.id, text);
    } else {
      setText(note.text);
    }
    setEditing(false);
  }

  function cancel() {
    setText(note.text);
    setEditing(false);
  }

  return (
    <article className={`day-note-card day-note-card--${dayNoteColor(note.color)}`} aria-label={`Note ${note.text}`}>
      {editing ? (
        <Stack gap="xs">
          <Textarea
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
            autosize
            minRows={2}
            aria-label="Note text"
          />
          <Group gap="xs" justify="flex-end">
            <Button size="compact-sm" variant="default" onClick={cancel}>Cancel</Button>
            <Button size="compact-sm" onClick={save}>Save</Button>
          </Group>
        </Stack>
      ) : (
        <>
          <Text className="day-note-card__text">{note.text}</Text>
          <Text size="xs" className="day-note-card__time">{stamp(note)}</Text>
          {!readOnly ? (
            <Group gap={4} justify="flex-end">
              <Button size="compact-xs" variant="subtle" color="dark" aria-label={`Edit note ${note.text}`} onClick={() => setEditing(true)}>Edit</Button>
              <Button size="compact-xs" variant="subtle" color="red" aria-label={`Delete note ${note.text}`} onClick={() => onDelete(note.id)}>Delete</Button>
            </Group>
          ) : null}
        </>
      )}
    </article>
  );
}
