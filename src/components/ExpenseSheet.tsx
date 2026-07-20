import { useEffect, useState } from 'react';
import { Button, Drawer, Group, Stack, Text, TextInput } from '@mantine/core';
import { IconBed, IconBus, IconHelp, IconReceipt, IconShoppingBag, IconTicket, IconToolsKitchen2 } from '@tabler/icons-react';
import type { ExpenseCategory, Place, TripExpense } from '../types';

const categories: Array<{ value: ExpenseCategory; label: string; Icon: typeof IconReceipt }> = [
  { value: 'food', label: 'Food', Icon: IconToolsKitchen2 },
  { value: 'transport', label: 'Transport', Icon: IconBus },
  { value: 'ticket', label: 'Ticket', Icon: IconTicket },
  { value: 'shopping', label: 'Shopping', Icon: IconShoppingBag },
  { value: 'accommodation', label: 'Hotel', Icon: IconBed },
  { value: 'other', label: 'Other', Icon: IconHelp },
];

type Props = {
  opened: boolean;
  dayId: string;
  dayLabel: string;
  currentStop?: Place;
  onClose: () => void;
  onSave: (expense: TripExpense) => void;
};

export function ExpenseSheet({ opened, dayId, dayLabel, currentStop, onClose, onSave }: Props) {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!opened) return;
    setAmount('');
    setCategory(null);
    setNote('');
  }, [opened]);

  const validAmount = Number(amount) > 0;
  const canSave = validAmount && category;

  function save() {
    if (!canSave || !category) return;
    onSave({
      id: `expense-${crypto.randomUUID()}`,
      dayId,
      placeId: currentStop?.id,
      amount: Number(amount),
      currency: 'TWD',
      category,
      note: note.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    onClose();
  }

  return <Drawer opened={opened} onClose={onClose} position="bottom" size="auto" title="Add expense" classNames={{ content: 'expense-sheet', header: 'expense-sheet__header' }}>
    <Stack gap="lg" pb="md">
      <TextInput aria-label="Amount" autoFocus value={amount} onChange={(event) => setAmount(event.currentTarget.value)} inputMode="decimal" type="number" min="0" step="0.01" leftSection={<Text fw={800}>TWD</Text>} placeholder="0" size="xl" className="expense-sheet__amount" error={amount && !validAmount ? 'Enter an amount greater than zero.' : undefined} />
      <div><Text fw={750} mb="xs">What was it for?</Text><div className="expense-sheet__categories">{categories.map(({ value, label, Icon }) => <Button key={value} variant={category === value ? 'filled' : 'default'} color="teal" aria-pressed={category === value} leftSection={<Icon size={18} />} onClick={() => setCategory(value)}>{label}</Button>)}</div></div>
      <div className="expense-sheet__context"><Text fw={700}>{currentStop?.name ?? 'General day expense'}</Text><Text size="sm" c="dimmed">{dayLabel}{currentStop ? ' · Current stop' : ''}</Text></div>
      <TextInput label="Note" value={note} onChange={(event) => setNote(event.currentTarget.value)} placeholder="Optional" />
      <Button size="lg" disabled={!canSave} onClick={save}>Save expense</Button>
    </Stack>
  </Drawer>;
}
