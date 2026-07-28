import { useEffect, useState } from 'react';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ActionIcon, Button, Checkbox, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { IconGripVertical, IconPlus, IconTrash } from '@tabler/icons-react';
import type { DayTask } from '../types';

interface DayTasksModalProps {
  opened: boolean;
  dayLabel: string;
  tasks: DayTask[];
  readOnly: boolean;
  onClose: () => void;
  onAdd: (text: string) => void;
  onUpdate: (taskId: string, text: string) => void;
  onToggle: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onReorder: (activeId: string, overId: string) => void;
}

export function DayTasksModal({ opened, dayLabel, tasks, readOnly, onClose, onAdd, onUpdate, onToggle, onDelete, onReorder }: DayTasksModalProps) {
  const [draft, setDraft] = useState('');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ordered = [...tasks].sort((a, b) => a.sortOrder - b.sortOrder);

  function add() {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft('');
  }

  function dragEnd(event: DragEndEvent) {
    if (event.over && event.active.id !== event.over.id) onReorder(String(event.active.id), String(event.over.id));
  }

  return (
    <Modal opened={opened} onClose={onClose} title={`${dayLabel} tasks`} centered>
      <Stack gap="sm">
        {!readOnly ? (
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <TextInput
              label="New task"
              placeholder="e.g. Bring attraction tickets"
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') add(); }}
              style={{ flex: 1 }}
              autoFocus
            />
            <Button onClick={add} aria-label="Add task" px="sm"><IconPlus size={18} /></Button>
          </Group>
        ) : null}
        {ordered.length ? (
          <DndContext sensors={readOnly ? [] : sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
            <SortableContext items={ordered.map((task) => task.id)} strategy={verticalListSortingStrategy}>
              <Stack gap={6}>
                {ordered.map((task) => (
                  <TaskEditorRow
                    key={task.id}
                    task={task}
                    readOnly={readOnly}
                    onUpdate={onUpdate}
                    onToggle={onToggle}
                    onDelete={onDelete}
                  />
                ))}
              </Stack>
            </SortableContext>
          </DndContext>
        ) : <Text c="dimmed" size="sm">No tasks for this day.</Text>}
      </Stack>
    </Modal>
  );
}

function TaskEditorRow({ task, readOnly, onUpdate, onToggle, onDelete }: {
  task: DayTask;
  readOnly: boolean;
  onUpdate: (taskId: string, text: string) => void;
  onToggle: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}) {
  const [text, setText] = useState(task.text);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: readOnly });
  useEffect(() => setText(task.text), [task.text]);
  const save = () => {
    if (text.trim()) onUpdate(task.id, text);
    else setText(task.text);
  };
  return (
    <Group
      ref={setNodeRef}
      gap={6}
      wrap="nowrap"
      className="day-task-editor-row"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .55 : 1 }}
    >
      {!readOnly ? <ActionIcon variant="subtle" color="gray" aria-label={`Reorder ${task.text}`} {...attributes} {...listeners}><IconGripVertical size={17} /></ActionIcon> : null}
      <Checkbox checked={task.completed} onChange={() => onToggle(task.id)} disabled={readOnly} aria-label={`Complete ${task.text}`} />
      <TextInput
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        onBlur={save}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        disabled={readOnly}
        className={task.completed ? 'day-task-editor-row__text day-task-editor-row__text--complete' : 'day-task-editor-row__text'}
        aria-label={`Task ${task.text}`}
      />
      {!readOnly ? <ActionIcon variant="subtle" color="red" aria-label={`Delete ${task.text}`} onClick={() => onDelete(task.id)}><IconTrash size={17} /></ActionIcon> : null}
    </Group>
  );
}
