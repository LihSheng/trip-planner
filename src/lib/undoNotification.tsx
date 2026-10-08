import type { ReactNode } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { useI18n } from '../i18n';

interface UndoableNotification {
  title: ReactNode;
  message: ReactNode;
  onUndo: () => void;
  t: ReturnType<typeof useI18n>['t'];
  color?: string;
}

let visibleUndoId: string | null = null;

export function showUndoableNotification({ title, message, onUndo, t, color = 'teal' }: UndoableNotification) {
  // Undo is one level deep: an older toast's button would revert the newer action instead.
  if (visibleUndoId) notifications.hide(visibleUndoId);
  const id = `undo-${crypto.randomUUID()}`;
  visibleUndoId = id;
  notifications.show({
    id,
    color,
    title,
    autoClose: 8000,
    onClose: () => { if (visibleUndoId === id) visibleUndoId = null; },
    message: (
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Text size="sm">{message}</Text>
        <Button
          variant="subtle"
          size="compact-sm"
          onClick={() => {
            onUndo();
            notifications.hide(id);
          }}
        >
          {t('undo')}
        </Button>
      </Group>
    ),
  });
}
