import { useEffect, useMemo, useState } from 'react';
import { ActionIcon, Badge, Button, Group, Menu, NativeSelect, NumberInput, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconBed, IconDots, IconEdit, IconPlane, IconPlus, IconReceipt, IconTrash, IconWallet } from '@tabler/icons-react';
import type { CurrencyCode, FlightBooking, StayBooking, TripExpense } from '../types';
import { expenseSources } from '../domain/expenses';
import { getExchangeRate } from '../lib/exchangeRates';
import { useTrip } from '../context/TripContext';
import { useI18n } from '../i18n';
import { currencies, ExpenseModal, FlightBookingModal, StayBookingModal } from './BookingModals';
import { addDays } from '../utils/date';

function money(amount: number, currency: CurrencyCode) {
  return amount.toLocaleString('en-MY', { style: 'currency', currency, maximumFractionDigits: 2 });
}

export function ExpensesPage() {
  const { locale } = useI18n(); const zh = locale === 'zh-TW';
  const planner = useTrip();
  const { state } = planner;
  const displayCurrency = state.displayCurrency ?? 'MYR';
  const rows = useMemo(() => expenseSources(state), [state]);
  const [converted, setConverted] = useState<Map<string, number> | null>(null);
  const [conversionError, setConversionError] = useState(false);
  const [expenseOpened, setExpenseOpened] = useState(false);
  const [flightOpened, setFlightOpened] = useState(false);
  const [stayOpened, setStayOpened] = useState(false);
  const [editingExpense, setEditingExpense] = useState<TripExpense>();
  const [editingFlight, setEditingFlight] = useState<FlightBooking>();
  const [editingStay, setEditingStay] = useState<StayBooking>();
  const [budgetAmount, setBudgetAmount] = useState<number | ''>(state.budget?.amount ?? '');
  const [budgetCurrency, setBudgetCurrency] = useState<CurrencyCode>(state.budget?.currency ?? displayCurrency);

  useEffect(() => {
    let active = true;
    setConversionError(false);
    void Promise.all(rows.map(async (row) => [row.id, row.amount * await getExchangeRate(row.currency, displayCurrency)] as const))
      .then((values) => { if (active) setConverted(new Map(values)); })
      .catch(() => { if (active) { setConverted(null); setConversionError(true); } });
    return () => { active = false; };
  }, [rows, displayCurrency]);

  useEffect(() => {
    setBudgetAmount(state.budget?.amount ?? '');
    setBudgetCurrency(state.budget?.currency ?? displayCurrency);
  }, [state.budget?.amount, state.budget?.currency, displayCurrency]);

  const total = converted ? [...converted.values()].reduce((sum, value) => sum + value, 0) : null;
  const [budgetConverted, setBudgetConverted] = useState<number | null>(null);
  useEffect(() => {
    if (!state.budget) { setBudgetConverted(null); return; }
    let active = true;
    void getExchangeRate(state.budget.currency, displayCurrency).then((rate) => { if (active) setBudgetConverted(state.budget!.amount * rate); }).catch(() => { if (active) setBudgetConverted(null); });
    return () => { active = false; };
  }, [state.budget, displayCurrency]);
  const remaining = total !== null && budgetConverted !== null ? budgetConverted - total : null;
  const hotels = state.places.filter((place) => place.category === 'Accommodation' && !place.assignmentOf);
  const categoryTotals = converted ? rows.reduce((totals, row) => {
    totals.set(row.category, (totals.get(row.category) ?? 0) + (converted.get(row.id) ?? 0));
    return totals;
  }, new Map<string, number>()) : null;
  const categoryLabel = (category: string) => ({
    food: zh ? '飲食' : 'Food', transport: zh ? '交通' : 'Transport', ticket: zh ? '門票' : 'Ticket',
    shopping: zh ? '購物' : 'Shopping', accommodation: zh ? '住宿' : 'Accommodation',
    flight: zh ? '航班' : 'Flights', other: zh ? '其他' : 'Other',
  }[category] ?? category);
  const uncosted = [
    ...(state.stayBookings ?? []).filter((booking) => !booking.cost).map((booking) => ({ source: 'stay' as const, id: booking.id, name: `${state.places.find((place) => place.id === booking.placeId)?.name ?? (zh ? '住宿' : 'Accommodation')} · ${booking.checkInDate}–${booking.checkOutDate}` })),
    ...(state.flightBookings ?? []).filter((booking) => !booking.totalCost).map((booking) => ({ source: 'flight' as const, id: booking.id, name: `${booking.outbound.departureAirport} → ${booking.outbound.arrivalAirport}${booking.tripType === 'round-trip' ? (zh ? ' 來回' : ' round trip') : ''}` })),
  ];

  function editRow(source: string, id: string) {
    if (source === 'manual') { setEditingExpense(state.expenses?.find((item) => item.id === id)); setExpenseOpened(true); }
    if (source === 'flight') { setEditingFlight(state.flightBookings?.find((item) => item.id === id)); setFlightOpened(true); }
    if (source === 'stay') { setEditingStay(state.stayBookings?.find((item) => item.id === id)); setStayOpened(true); }
  }
  const tripDates = new Set(state.days.map((_, index) => addDays(state.startDate, index).toISOString().slice(0, 10)));
  const flightOutside = (id: string) => {
    const booking = state.flightBookings?.find((item) => item.id === id);
    return Boolean(booking && [booking.outbound, ...(booking.return ? [booking.return] : [])].some((leg) => !tripDates.has(leg.departureDate)));
  };
  const rowName = (row: (typeof rows)[number]) => {
    if (row.source === 'stay') {
      const booking = state.stayBookings?.find((item) => item.id === row.sourceId);
      return booking ? `${state.places.find((place) => place.id === booking.placeId)?.name ?? (zh ? '住宿' : 'Accommodation')} · ${booking.checkInDate}–${booking.checkOutDate}` : row.name;
    }
    if (row.source === 'flight') {
      const booking = state.flightBookings?.find((item) => item.id === row.sourceId);
      return booking ? `${booking.outbound.departureAirport} → ${booking.outbound.arrivalAirport}${booking.tripType === 'round-trip' ? (zh ? ' 來回' : ' round trip') : ''}` : row.name;
    }
    const expense = state.expenses?.find((item) => item.id === row.sourceId);
    return expense?.name ?? expense?.note ?? (zh ? '支出' : 'Expense');
  };

  return <main className="expenses-page">
    <Group justify="space-between" align="flex-end" mb="lg">
      <div><Title order={1}>{zh ? '支出' : 'Expenses'}</Title><Text c="dimmed">{zh ? '查看整趟旅程的預估費用。' : 'See your approximate whole-trip cost.'}</Text></div>
      {!planner.isReadOnly ? <Menu position="bottom-end"><Menu.Target><Button leftSection={<IconPlus size={17} />}>{zh ? '新增' : 'Add'}</Button></Menu.Target><Menu.Dropdown>
        <Menu.Item leftSection={<IconReceipt size={16} />} onClick={() => { setEditingExpense(undefined); setExpenseOpened(true); }}>{zh ? '手動支出' : 'Manual expense'}</Menu.Item>
        <Menu.Item leftSection={<IconPlane size={16} />} onClick={() => { setEditingFlight(undefined); setFlightOpened(true); }}>{zh ? '航班訂單' : 'Flight booking'}</Menu.Item>
      </Menu.Dropdown></Menu> : null}
    </Group>

    <SimpleGrid cols={{ base: 1, sm: 3 }} mb="lg">
      <Paper withBorder radius="lg" p="lg"><Text c="dimmed" size="sm">{zh ? '預估總額' : 'Approximate total'}</Text><Title order={2}>{total === null ? '—' : `≈ ${money(total, displayCurrency)}`}</Title>{conversionError ? <Text c="orange" size="xs">{zh ? '部分匯率無法取得；原幣金額仍顯示如下。' : 'Some conversion rates are unavailable; original amounts remain below.'}</Text> : <Text c="dimmed" size="xs">{zh ? '依目前快取匯率' : 'Using current cached rates'}</Text>}</Paper>
      <Paper withBorder radius="lg" p="lg"><Text c="dimmed" size="sm">{zh ? '整趟預算' : 'Whole-trip budget'}</Text><Title order={2}>{state.budget ? money(state.budget.amount, state.budget.currency) : '—'}</Title></Paper>
      <Paper withBorder radius="lg" p="lg"><Text c="dimmed" size="sm">{remaining !== null && remaining < 0 ? (zh ? '超出預算' : 'Overspent') : (zh ? '剩餘預算' : 'Remaining')}</Text><Title order={2} c={remaining !== null && remaining < 0 ? 'red' : 'teal'}>{remaining === null ? '—' : money(Math.abs(remaining), displayCurrency)}</Title></Paper>
    </SimpleGrid>
    {categoryTotals?.size ? <Paper withBorder radius="lg" p="md" mb="lg"><Text fw={800} mb="xs">{zh ? '類別小計' : 'Category subtotals'}</Text><Group gap="xl">{[...categoryTotals.entries()].map(([category, amount]) => <div key={category}><Text size="xs" c="dimmed">{categoryLabel(category)}</Text><Text fw={750}>{money(amount, displayCurrency)}</Text></div>)}</Group></Paper> : null}

    {!planner.isReadOnly ? <Paper withBorder radius="lg" p="md" mb="lg">
      <Group align="flex-end"><NumberInput label={zh ? '整趟預算' : 'Whole-trip budget'} min={0} decimalScale={2} value={budgetAmount} onChange={(value) => setBudgetAmount(typeof value === 'number' ? value : '')} /><NativeSelect label={zh ? '貨幣' : 'Currency'} data={currencies} value={budgetCurrency} onChange={(event) => setBudgetCurrency(event.currentTarget.value as CurrencyCode)} /><Button leftSection={<IconWallet size={17} />} onClick={() => planner.updateBudget(Number(budgetAmount) > 0 ? { amount: Number(budgetAmount), currency: budgetCurrency } : undefined)}>{zh ? '儲存預算' : 'Save budget'}</Button></Group>
    </Paper> : null}

    <Stack>
      {uncosted.map((row) => <Paper key={`${row.source}:${row.id}`} withBorder radius="lg" p="md">
        <Group justify="space-between"><Group>{row.source === 'flight' ? <IconPlane /> : <IconBed />}<div><Text fw={750}>{row.name}</Text><Group gap="xs"><Text size="xs" c="orange">{zh ? '尚未填寫費用' : 'Cost not added yet'}</Text>{row.source === 'flight' && flightOutside(row.id) ? <Badge color="orange" variant="light">{zh ? '超出行程日期' : 'Outside itinerary dates'}</Badge> : null}</Group></div></Group>{!planner.isReadOnly ? <Button size="xs" variant="light" onClick={() => editRow(row.source, row.id)}>{zh ? '新增費用' : 'Add cost'}</Button> : null}</Group>
      </Paper>)}
      {rows.length ? rows.map((row) => <Paper key={row.id} withBorder radius="lg" p="md">
        <Group justify="space-between" wrap="nowrap"><Group wrap="nowrap">{row.source === 'flight' ? <IconPlane /> : row.source === 'stay' ? <IconBed /> : <IconReceipt />}<div><Text fw={750}>{rowName(row)}</Text><Group gap="xs"><Badge variant="light">{categoryLabel(row.category)}</Badge>{row.source === 'flight' && flightOutside(row.sourceId) ? <Badge color="orange" variant="light">{zh ? '超出行程日期' : 'Outside itinerary dates'}</Badge> : null}<Text size="xs" c="dimmed">{row.source === 'manual' ? (zh ? '手動支出' : 'Manual') : (zh ? '訂單費用，只計算一次' : 'Booking cost · counted once')}</Text></Group></div></Group>
          <Group wrap="nowrap"><div><Text fw={800} ta="right">{money(row.amount, row.currency)}</Text>{converted?.has(row.id) && row.currency !== displayCurrency ? <Text size="xs" c="dimmed" ta="right">≈ {money(converted.get(row.id)!, displayCurrency)}</Text> : null}</div>
          {!planner.isReadOnly ? <Menu position="bottom-end"><Menu.Target><ActionIcon variant="subtle" color="gray"><IconDots size={18} /></ActionIcon></Menu.Target><Menu.Dropdown><Menu.Item leftSection={<IconEdit size={16} />} onClick={() => editRow(row.source, row.sourceId)}>{zh ? '編輯' : 'Edit'}</Menu.Item>{row.source === 'manual' ? <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => planner.deleteExpense(row.sourceId)}>{zh ? '刪除' : 'Delete'}</Menu.Item> : null}</Menu.Dropdown></Menu> : null}</Group>
        </Group>
      </Paper>) : !uncosted.length ? <Paper withBorder radius="lg" p="xl"><Text ta="center" c="dimmed">{zh ? '尚未記錄任何支出。新增住宿、航班或手動支出。' : 'No expenses recorded yet. Add a stay, flight, or manual expense.'}</Text></Paper> : null}
    </Stack>

    <ExpenseModal opened={expenseOpened} expense={editingExpense} days={state.days} places={state.places} defaultCurrency={displayCurrency} onClose={() => setExpenseOpened(false)} onSave={(expense) => editingExpense ? planner.updateExpense(expense) : planner.addExpense(expense)} />
    <FlightBookingModal opened={flightOpened} booking={editingFlight} defaultCurrency={displayCurrency} onClose={() => setFlightOpened(false)} onSave={planner.saveFlightBooking} onDelete={planner.deleteFlightBooking} />
    <StayBookingModal opened={stayOpened} booking={editingStay} hotels={hotels} defaultCurrency={displayCurrency} onClose={() => setStayOpened(false)} onSave={planner.saveStayBooking} onDelete={planner.deleteStayBooking} />
  </main>;
}
