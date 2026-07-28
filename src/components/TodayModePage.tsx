import { useEffect, useMemo, useState } from 'react';
import { ActionIcon, Badge, Button, Checkbox, Collapse, Group, Menu, Modal, Paper, Select, Stack, Text, Textarea, Title, Tooltip, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCheck, IconChevronDown, IconCircle, IconClock, IconDots,
  IconArrowRight, IconFileText, IconListCheck, IconMapPin, IconPlayerSkipForward, IconReceipt, IconRoute, IconTrash,
} from '@tabler/icons-react';
import type { DayTask, Place, StopExecutionStatus, TripDay } from '../types';
import { addDays } from '../utils/date';
import { ExpenseSheet } from './ExpenseSheet';
import { getTwdExchangeRate } from '../lib/exchangeRates';
import { useTrip } from '../context/TripContext';
import type { CurrentLocationState } from '../hooks/useCurrentLocation';
import { navigationUrl, placeStatus, timeRange } from '../utils/mapPresentation';

const labels: Record<StopExecutionStatus, string> = {
  upcoming: 'Up next', current: 'Current stop', completed: 'Completed', skipped: 'Skipped', rescheduled: 'Rescheduled',
};

function dayDate(startDate: string, index: number) {
  return addDays(startDate, index).toISOString().slice(0, 10);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

interface TodayModePageProps {
  location: CurrentLocationState;
}

export function TodayModePage({ location }: TodayModePageProps) {
  const { state, placesById, isReadOnly: readOnly, updateExecution: onUpdateExecution, updatePlace: onUpdatePlace, addExpense: onAddExpense, toggleDayTask, deleteDayTask, moveDayTask } = useTrip();
  const sessionKey = `trip-planner:today-day:${state.tripName}`;
  const [activeDayId, setActiveDayId] = useState(() => sessionStorage.getItem(sessionKey) ?? '');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [expenseOpened, setExpenseOpened] = useState(false);
  const [displayRate, setDisplayRate] = useState<number | null>(null);
  const [completedTasksOpen, setCompletedTasksOpen] = useState(false);

  const activeDay = useMemo(() => {
    const selected = state.days.find((day) => day.id === activeDayId);
    if (selected) return selected;
    const today = new Date().toISOString().slice(0, 10);
    const byDate = state.days.find((_, index) => dayDate(state.startDate, index) === today);
    const incomplete = state.days.find((day) => day.placeIds.some((id) => {
      const status = state.executionByDay?.[day.id]?.stopStates[id]?.status;
      return status !== 'completed' && status !== 'skipped' && status !== 'rescheduled';
    }));
    return byDate ?? incomplete ?? state.days[0];
  }, [activeDayId, state.days, state.executionByDay, state.startDate]);

  useEffect(() => {
    if (!activeDay) return;
    setActiveDayId(activeDay.id);
    sessionStorage.setItem(sessionKey, activeDay.id);
  }, [activeDay, sessionKey]);

  if (!activeDay) return <Paper className="today-empty"><Title order={2}>Nothing planned for this day</Title><Text c="dimmed">Add stops in Planner to start Today Mode.</Text></Paper>;

  const execution = state.executionByDay?.[activeDay.id];
  const stops = activeDay.placeIds.map((id) => placesById.get(id)).filter((place): place is Place => Boolean(place));
  const current = stops.find((place) => placeStatus(activeDay, execution, place.id) === 'current');
  const next = stops.find((place) => place.id !== current?.id && placeStatus(activeDay, execution, place.id) === 'upcoming');
  const complete = stops.length > 0 && stops.every((place) => ['completed', 'skipped', 'rescheduled'].includes(placeStatus(activeDay, execution, place.id)));
  const detail = detailId ? placesById.get(detailId) : undefined;
  const dayExpenses = (state.expenses ?? []).filter((expense) => expense.dayId === activeDay.id);
  const dayTotals = dayExpenses.reduce((totals, expense) => ({ ...totals, [expense.currency]: (totals[expense.currency] ?? 0) + expense.amount }), {} as Record<string, number>);
  const twdDayTotal = dayTotals.TWD ?? 0;
  const activeDayIndex = state.days.indexOf(activeDay);
  const tasks = state.dayTasks ?? [];
  const currentTasks = tasks.filter((task) => task.dayId === activeDay.id && !task.completed).sort((a, b) => a.sortOrder - b.sortOrder);
  const completedTasks = tasks.filter((task) => task.dayId === activeDay.id && task.completed).sort((a, b) => a.sortOrder - b.sortOrder);
  const priorDayIds = new Set(state.days.slice(0, activeDayIndex).map((day) => day.id));
  const overdueTasks = tasks.filter((task) => priorDayIds.has(task.dayId) && !task.completed).sort((a, b) => a.sortOrder - b.sortOrder);

  useEffect(() => {
    setNoteDraft(detail?.notes ?? '');
  }, [detail?.id, detail?.notes]);

  useEffect(() => {
    let cancelled = false;
    void getTwdExchangeRate(state.displayCurrency ?? 'MYR')
      .then((rate) => { if (!cancelled) setDisplayRate(rate); })
      .catch(() => { if (!cancelled) setDisplayRate(null); });
    return () => { cancelled = true; };
  }, [state.displayCurrency]);

  function update(placeId: string, status: StopExecutionStatus) {
    onUpdateExecution(activeDay.id, placeId, status);
    notifications.show({ color: status === 'skipped' ? 'orange' : 'teal', title: labels[status], message: 'Today’s stop status was saved.', withCloseButton: true });
  }

  function openNavigation(place: Place) {
    window.open(navigationUrl(place, location.location), '_blank', 'noopener,noreferrer');
  }

  const liveDotVisible = location.isTracking && location.permission !== 'unsupported';
  const liveDotTooltip = location.isTracking
    ? 'Using your location for navigation origins'
    : 'Live location lives in trip settings';

  return (
    <main className="today-mode" aria-label="Today Mode">
      <header className="today-header">
        <div>
          <Group gap={8} align="center" wrap="nowrap" className="today-title-row">
            <Title order={1}>Today · Day {state.days.indexOf(activeDay) + 1}</Title>
            {liveDotVisible ? (
              <Tooltip label={liveDotTooltip} withArrow>
                <span className="today-live-dot" aria-label="Location live">
                  <span className="today-live-dot__core" />
                </span>
              </Tooltip>
            ) : null}
          </Group>
          <Text c="dimmed" size="lg">{dateLabel(dayDate(state.startDate, state.days.indexOf(activeDay)))} · {stops[0]?.region || state.tripName}</Text>
        </div>
        <Group className="today-header__controls" gap="sm" wrap="nowrap" align="center">
          <Select aria-label="Choose day" value={activeDay.id} onChange={(value) => value && setActiveDayId(value)} data={state.days.map((day, index) => ({ value: day.id, label: `Day ${index + 1} · ${day.label}` }))} className="today-day-select" />
        </Group>
      </header>

      {complete ? <Paper className="today-complete"><IconCheck size={22} /><div><Text fw={800}>Day complete</Text><Text size="sm" c="dimmed">All stops have been completed or skipped.</Text></div></Paper> : null}

      {(overdueTasks.length || currentTasks.length || completedTasks.length) ? (
        <Paper className="today-tasks" radius="xl">
          <Group justify="space-between" mb="sm">
            <Group gap="xs"><IconListCheck size={21} /><Title order={2}>Tasks</Title></Group>
            <Text size="sm" c="dimmed">{currentTasks.length} remaining today</Text>
          </Group>
          {overdueTasks.length ? (
            <Stack gap={6} className="today-tasks__overdue" mb="md">
              <Text fw={800} size="sm" c="red">Overdue · {overdueTasks.length}</Text>
              {overdueTasks.map((task) => (
                <TodayTaskRow
                  key={task.id}
                  task={task}
                  dayLabel={state.days.find((day) => day.id === task.dayId)?.label}
                  overdue
                  readOnly={readOnly}
                  onToggle={() => toggleDayTask(task.id)}
                  onMove={() => moveDayTask(task.id, activeDay.id)}
                  onDelete={() => deleteDayTask(task.id)}
                />
              ))}
            </Stack>
          ) : null}
          <Stack gap={6}>
            {currentTasks.map((task) => <TodayTaskRow key={task.id} task={task} readOnly={readOnly} onToggle={() => toggleDayTask(task.id)} />)}
            {!currentTasks.length && !completedTasks.length ? <Text c="dimmed" size="sm">No tasks for today.</Text> : null}
          </Stack>
          {completedTasks.length ? (
            <>
              <UnstyledButton className="today-tasks__completed-toggle" onClick={() => setCompletedTasksOpen((open) => !open)}>
                <Text size="sm" fw={700}>Completed · {completedTasks.length}</Text>
                <IconChevronDown size={17} style={{ transform: completedTasksOpen ? 'rotate(180deg)' : undefined }} />
              </UnstyledButton>
              <Collapse expanded={completedTasksOpen}>
                <Stack gap={6} mt={6}>
                  {completedTasks.map((task) => <TodayTaskRow key={task.id} task={task} readOnly={readOnly} onToggle={() => toggleDayTask(task.id)} onDelete={() => deleteDayTask(task.id)} />)}
                </Stack>
              </Collapse>
            </>
          ) : null}
        </Paper>
      ) : null}

      {current ? <StopCard place={current} day={activeDay} status="current" readOnly={readOnly} onDetail={() => setDetailId(current.id)} onNavigate={() => openNavigation(current)} onUpdate={update} /> : null}
      {next ? <StopCard place={next} day={activeDay} status="upcoming" readOnly={readOnly} onDetail={() => setDetailId(next.id)} onNavigate={() => openNavigation(next)} onUpdate={update} /> : null}

      <Paper className="today-timeline" radius="xl">
        <Group justify="space-between" mb="xs"><Title order={2}>Day timeline</Title><Text size="sm" c="dimmed">{stops.length} stops</Text></Group>
        <Stack gap={0}>
          {stops.map((place) => <TimelineRow key={place.id} place={place} day={activeDay} status={placeStatus(activeDay, execution, place.id)} onClick={() => setDetailId(place.id)} />)}
        </Stack>
      </Paper>

      {!readOnly ? <><Paper className="today-quick-actions" radius="xl"><Button variant="subtle" leftSection={<IconFileText size={19} />} onClick={() => setDetailId(current?.id ?? next?.id ?? null)} disabled={!current && !next}>Notes</Button><Button variant="subtle" leftSection={<IconReceipt size={19} />} onClick={() => setExpenseOpened(true)}>Expense</Button><Button variant="subtle" leftSection={<IconPlayerSkipForward size={19} />} onClick={() => current && update(current.id, 'skipped')}>Skip</Button></Paper><Paper className="today-expense-summary" radius="xl"><span><IconReceipt size={20} /><Text fw={750}>Today’s spending</Text></span>{Object.entries(dayTotals).map(([currency, amount]) => <Text key={currency} fw={800}>{amount.toLocaleString('en-MY', { style: 'currency', currency, maximumFractionDigits: 2 })}</Text>)}{!dayExpenses.length ? <Text fw={800}>TWD 0</Text> : null}{displayRate && twdDayTotal ? <Text size="sm" c="dimmed" className="today-expense-summary__conversion">TWD portion ≈ {(twdDayTotal * displayRate).toLocaleString('en-MY', { style: 'currency', currency: state.displayCurrency ?? 'MYR', maximumFractionDigits: 2 })} · Daily rate</Text> : null}{dayExpenses.length ? <Text size="sm" c="dimmed">{dayExpenses.length} {dayExpenses.length === 1 ? 'expense' : 'expenses'} recorded</Text> : null}<Text size="xs" c="dimmed" className="today-expense-summary__attribution">Rates by ExchangeRate-API</Text></Paper></> : null}

      <Modal opened={Boolean(detail)} onClose={() => setDetailId(null)} title={detail?.name} centered>
        {detail ? <Stack><Badge color="teal" variant="light">{labels[placeStatus(activeDay, execution, detail.id)]}</Badge>{readOnly ? <Text size="sm">{detail.notes || 'No notes added.'}</Text> : <><Textarea label="Notes" description="Add visit details, tips, or memories for this place." value={noteDraft} onChange={(event) => setNoteDraft(event.currentTarget.value)} minRows={4} autosize /><Button variant="light" color="teal" disabled={noteDraft === detail.notes} onClick={() => { onUpdatePlace({ ...detail, notes: noteDraft.trim() }); notifications.show({ color: 'teal', title: 'Notes saved', message: `Notes for ${detail.name} were updated.` }); }}>Save notes</Button></>}<Text size="sm" c="dimmed">{detail.region} · {timeRange(activeDay, detail.id)}</Text><Button onClick={() => openNavigation(detail)} leftSection={<IconRoute size={18} />}>Open navigation</Button>{!readOnly ? <Button variant="light" color="teal" onClick={() => update(detail.id, 'current')}>Make current stop</Button> : null}</Stack> : null}
      </Modal>
      {!readOnly ? <ExpenseSheet opened={expenseOpened} onClose={() => setExpenseOpened(false)} dayId={activeDay.id} dayLabel={`Day ${state.days.indexOf(activeDay) + 1}`} currentStop={current} onSave={(expense) => { onAddExpense(expense); notifications.show({ color: 'teal', title: 'Expense added', message: `${expense.currency} ${expense.amount.toLocaleString()} ${expense.category} expense added.` }); }} /> : null}
    </main>
  );
}

function TodayTaskRow({ task, dayLabel, overdue = false, readOnly, onToggle, onMove, onDelete }: {
  task: DayTask;
  dayLabel?: string;
  overdue?: boolean;
  readOnly: boolean;
  onToggle: () => void;
  onMove?: () => void;
  onDelete?: () => void;
}) {
  return (
    <Group className={`today-task-row${overdue ? ' today-task-row--overdue' : ''}`} gap="sm" wrap="nowrap">
      <Checkbox checked={task.completed} disabled={readOnly} onChange={onToggle} aria-label={`Complete ${task.text}`} />
      <div className="today-task-row__copy">
        <Text size="sm" td={task.completed ? 'line-through' : undefined}>{task.text}</Text>
        {dayLabel ? <Text size="xs" c={overdue ? 'red' : 'dimmed'}>{dayLabel}</Text> : null}
      </div>
      {!readOnly && (onMove || onDelete) ? (
        <Menu shadow="md" position="bottom-end">
          <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${task.text}`}><IconDots size={18} /></ActionIcon></Menu.Target>
          <Menu.Dropdown>
            {onMove ? <Menu.Item leftSection={<IconArrowRight size={16} />} onClick={onMove}>Move to today</Menu.Item> : null}
            {onDelete ? <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={onDelete}>Delete</Menu.Item> : null}
          </Menu.Dropdown>
        </Menu>
      ) : null}
    </Group>
  );
}

function StopCard({ place, day, status, readOnly, onDetail, onNavigate, onUpdate }: { place: Place; day: TripDay; status: StopExecutionStatus; readOnly: boolean; onDetail: () => void; onNavigate: () => void; onUpdate: (id: string, status: StopExecutionStatus) => void }) {
  const current = status === 'current';
  return <Paper className={`today-stop-card today-stop-card--${status}`} radius="xl"><Group justify="space-between" align="flex-start"><Badge color="teal" variant="light">{current ? 'CURRENT STOP' : 'UP NEXT'}</Badge>{!readOnly ? <Menu shadow="md" position="bottom-end"><Menu.Target><ActionIcon variant="subtle" color="gray" aria-label={`More actions for ${place.name}`}><IconDots size={22} /></ActionIcon></Menu.Target><Menu.Dropdown><Menu.Item leftSection={<IconFileText size={16} />} onClick={onDetail}>View notes</Menu.Item><Menu.Item leftSection={<IconPlayerSkipForward size={16} />} onClick={() => onUpdate(place.id, 'skipped')}>Skip stop</Menu.Item><Menu.Item leftSection={<IconClock size={16} />} onClick={() => onUpdate(place.id, 'current')}>Make current</Menu.Item></Menu.Dropdown></Menu> : null}</Group><Title order={2}>{place.name}</Title><Text c="teal" fw={650}>{place.category}</Text><Stack gap="xs" mt="sm"><Group gap="xs"><IconClock size={19} /><Text>{timeRange(day, place.id)}</Text></Group><Group gap="xs" align="flex-start"><IconMapPin size={19} /><Text>{place.region || 'Location available offline'}</Text></Group></Stack><Group grow mt="lg"><Button onClick={onNavigate} leftSection={<IconRoute size={18} />}>Open navigation</Button>{!readOnly ? <Button variant="outline" color="teal" leftSection={<IconCheck size={18} />} onClick={() => onUpdate(place.id, current ? 'completed' : 'current')}>{current ? 'Mark complete' : 'Mark arrived'}</Button> : null}</Group></Paper>;
}

function TimelineRow({ place, day, status, onClick }: { place: Place; day: TripDay; status: StopExecutionStatus; onClick: () => void }) {
  const icon = status === 'completed' ? <IconCheck size={17} /> : <IconCircle size={17} />;
  return <button type="button" className={`today-timeline-row today-timeline-row--${status}`} onClick={onClick}><span className="today-timeline-row__marker">{icon}</span><span className="today-timeline-row__time">{day.stopSchedules?.[place.id]?.startTime ?? 'Later'}</span><span className="today-timeline-row__copy"><strong>{place.name}</strong><small>{status === 'current' ? `Now · ${timeRange(day, place.id)}` : status === 'upcoming' ? timeRange(day, place.id) : labels[status]}</small></span><IconChevronDown size={18} /></button>;
}
