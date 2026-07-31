import { Badge, Group, Paper, Text } from '@mantine/core';
import { IconBed, IconPlane } from '@tabler/icons-react';
import type { CurrencyCode } from '../types';

export interface PlannerBookingCard {
  id: string;
  kind: 'stay' | 'flight';
  sourceId: string;
  title: string;
  label: string;
  detail: string;
  cost?: { amount: number; currency: CurrencyCode };
}

export function BookingCard({ card, onEdit }: { card: PlannerBookingCard; onEdit?: (card: PlannerBookingCard) => void }) {
  const Icon = card.kind === 'flight' ? IconPlane : IconBed;
  return <Paper withBorder radius="md" p="sm" className="booking-card" onClick={() => onEdit?.(card)} role={onEdit ? 'button' : undefined}>
    <Group justify="space-between" align="flex-start" wrap="nowrap">
      <Group gap="xs" wrap="nowrap"><Icon size={19} /><div><Badge size="xs" variant="light">{card.label}</Badge><Text fw={750}>{card.title}</Text><Text size="xs" c="dimmed">{card.detail}</Text></div></Group>
      {card.kind === 'flight' && card.cost ? <Text fw={800} size="sm">{card.cost.currency} {card.cost.amount.toLocaleString()}</Text> : null}
    </Group>
  </Paper>;
}
