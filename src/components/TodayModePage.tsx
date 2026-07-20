import { useEffect, useMemo, useState } from 'react';
import { ActionIcon, Badge, Button, Group, Menu, Modal, Paper, Select, Stack, Text, Textarea, Title, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCalendar, IconCar, IconCheck, IconChevronDown, IconCircle, IconClock, IconDots,
  IconExternalLink, IconFileText, IconMapPin, IconPlayerSkipForward, IconReceipt, IconRoute,
} from '@tabler/icons-react';
import type { DayExecutionState, Place, StopExecutionStatus, TripDay, TripState } from '../types';
import { addDays } from '../utils/date';

type Props = {
  state: TripState;
  placesById: Map<string, Place>;
  readOnly: boolean;
  onUpdateExecution: (dayId: string, placeId: string, status: StopExecutionStatus) => void;
  onUpdatePlace: (place: Place) => void;
};

const labels: Record<StopExecutionStatus, string> = {
  upcoming: 'Up next', current: 'Current stop', completed: 'Completed', skipped: 'Skipped', rescheduled: 'Rescheduled',
};

function dayDate(startDate: string, index: number) {
  return addDays(startDate, index).toISOString().slice(0, 10);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function placeStatus(day: TripDay, execution: DayExecutionState | undefined, placeId: string): StopExecutionStatus {
  const stored = execution?.stopStates[placeId]?.status;
  if (stored) return stored;
  const firstEligible = day.placeIds.find((id) => !['completed', 'skipped', 'rescheduled'].includes(execution?.stopStates[id]?.status ?? 'upcoming'));
  return firstEligible === placeId ? 'current' : 'upcoming';
}

function mapsUrl(place: Place) {
  return `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`;
}

function timeRange(day: TripDay, placeId: string) {
  const schedule = day.stopSchedules?.[placeId];
  if (!schedule?.startTime) return 'No fixed time';
  if (!schedule.durationMinutes) return schedule.startTime;
  const [hour, minute] = schedule.startTime.split(':').map(Number);
  const end = new Date(2000, 0, 1, hour, minute + schedule.durationMinutes);
  return `${schedule.startTime}–${end.toTimeString().slice(0, 5)}`;
}

export function TodayModePage({ state, placesById, readOnly, onUpdateExecution, onUpdatePlace }: Props) {
  const sessionKey = `trip-planner:today-day:${state.tripName}`;
  const [activeDayId, setActiveDayId] = useState(() => sessionStorage.getItem(sessionKey) ?? '');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

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

  useEffect(() => {
    setNoteDraft(detail?.notes ?? '');
  }, [detail?.id, detail?.notes]);

  function update(placeId: string, status: StopExecutionStatus) {
    onUpdateExecution(activeDay.id, placeId, status);
    notifications.show({ color: status === 'skipped' ? 'orange' : 'teal', title: labels[status], message: 'Today’s stop status was saved.', withCloseButton: true });
  }

  return (
    <main className="today-mode" aria-label="Today Mode">
      <header className="today-header">
        <div>
          <Title order={1}>Today · Day {state.days.indexOf(activeDay) + 1}</Title>
          <Text c="dimmed" size="lg">{dateLabel(dayDate(state.startDate, state.days.indexOf(activeDay)))} · {stops[0]?.region || state.tripName}</Text>
        </div>
        <Select aria-label="Choose day" value={activeDay.id} onChange={(value) => value && setActiveDayId(value)} data={state.days.map((day, index) => ({ value: day.id, label: `Day ${index + 1} · ${day.label}` }))} className="today-day-select" />
      </header>

      {complete ? <Paper className="today-complete"><IconCheck size={22} /><div><Text fw={800}>Day complete</Text><Text size="sm" c="dimmed">All stops have been completed or skipped.</Text></div></Paper> : null}

      {current ? <StopCard place={current} day={activeDay} status="current" readOnly={readOnly} onDetail={() => setDetailId(current.id)} onNavigate={() => window.open(mapsUrl(current), '_blank', 'noopener,noreferrer')} onUpdate={update} /> : null}
      {next ? <StopCard place={next} day={activeDay} status="upcoming" readOnly={readOnly} onDetail={() => setDetailId(next.id)} onNavigate={() => window.open(mapsUrl(next), '_blank', 'noopener,noreferrer')} onUpdate={update} /> : null}

      <Paper className="today-timeline" radius="xl">
        <Group justify="space-between" mb="xs"><Title order={2}>Day timeline</Title><Text size="sm" c="dimmed">{stops.length} stops</Text></Group>
        <Stack gap={0}>
          {stops.map((place) => <TimelineRow key={place.id} place={place} day={activeDay} status={placeStatus(activeDay, execution, place.id)} onClick={() => setDetailId(place.id)} />)}
        </Stack>
      </Paper>

      {!readOnly ? <Paper className="today-quick-actions" radius="xl"><Button variant="subtle" leftSection={<IconFileText size={19} />} onClick={() => setDetailId(current?.id ?? next?.id ?? null)} disabled={!current && !next}>Notes</Button><Button variant="subtle" leftSection={<IconReceipt size={19} />} onClick={() => notifications.show({ title: 'Expense', message: 'Expense entry is ready for the next release.' })}>Expense</Button><Button variant="subtle" leftSection={<IconPlayerSkipForward size={19} />} onClick={() => current && update(current.id, 'skipped')}>Skip</Button></Paper> : null}

      <Modal opened={Boolean(detail)} onClose={() => setDetailId(null)} title={detail?.name} centered>
        {detail ? <Stack><Badge color="teal" variant="light">{labels[placeStatus(activeDay, execution, detail.id)]}</Badge>{readOnly ? <Text size="sm">{detail.notes || 'No notes added.'}</Text> : <><Textarea label="Notes" description="Add visit details, tips, or memories for this place." value={noteDraft} onChange={(event) => setNoteDraft(event.currentTarget.value)} minRows={4} autosize /><Button variant="light" color="teal" disabled={noteDraft === detail.notes} onClick={() => { onUpdatePlace({ ...detail, notes: noteDraft.trim() }); notifications.show({ color: 'teal', title: 'Notes saved', message: `Notes for ${detail.name} were updated.` }); }}>Save notes</Button></>}<Text size="sm" c="dimmed">{detail.region} · {timeRange(activeDay, detail.id)}</Text><Button component="a" href={mapsUrl(detail)} target="_blank" leftSection={<IconRoute size={18} />}>Open navigation</Button>{!readOnly ? <Button variant="light" color="teal" onClick={() => update(detail.id, 'current')}>Make current stop</Button> : null}</Stack> : null}
      </Modal>
    </main>
  );
}

function StopCard({ place, day, status, readOnly, onDetail, onNavigate, onUpdate }: { place: Place; day: TripDay; status: StopExecutionStatus; readOnly: boolean; onDetail: () => void; onNavigate: () => void; onUpdate: (id: string, status: StopExecutionStatus) => void }) {
  const current = status === 'current';
  return <Paper className={`today-stop-card today-stop-card--${status}`} radius="xl"><Group justify="space-between" align="flex-start"><Badge color="teal" variant="light">{current ? 'CURRENT STOP' : 'UP NEXT'}</Badge>{!readOnly ? <Menu shadow="md" position="bottom-end"><Menu.Target><ActionIcon variant="subtle" color="gray" aria-label={`More actions for ${place.name}`}><IconDots size={22} /></ActionIcon></Menu.Target><Menu.Dropdown><Menu.Item leftSection={<IconFileText size={16} />} onClick={onDetail}>View notes</Menu.Item><Menu.Item leftSection={<IconPlayerSkipForward size={16} />} onClick={() => onUpdate(place.id, 'skipped')}>Skip stop</Menu.Item><Menu.Item leftSection={<IconClock size={16} />} onClick={() => onUpdate(place.id, 'current')}>Make current</Menu.Item></Menu.Dropdown></Menu> : null}</Group><Title order={2}>{place.name}</Title><Text c="teal" fw={650}>{place.category}</Text><Stack gap="xs" mt="sm"><Group gap="xs"><IconClock size={19} /><Text>{timeRange(day, place.id)}</Text></Group><Group gap="xs" align="flex-start"><IconMapPin size={19} /><Text>{place.region || 'Location available offline'}</Text></Group></Stack><Group grow mt="lg"><Button onClick={onNavigate} leftSection={<IconRoute size={18} />}>Open navigation</Button>{!readOnly ? <Button variant="outline" color="teal" leftSection={<IconCheck size={18} />} onClick={() => onUpdate(place.id, current ? 'completed' : 'current')}>{current ? 'Mark complete' : 'Mark arrived'}</Button> : null}</Group></Paper>;
}

function TimelineRow({ place, day, status, onClick }: { place: Place; day: TripDay; status: StopExecutionStatus; onClick: () => void }) {
  const icon = status === 'completed' ? <IconCheck size={17} /> : status === 'current' ? <IconCircle size={17} /> : <IconCircle size={17} />;
  return <button type="button" className={`today-timeline-row today-timeline-row--${status}`} onClick={onClick}><span className="today-timeline-row__marker">{icon}</span><span className="today-timeline-row__time">{day.stopSchedules?.[place.id]?.startTime ?? 'Later'}</span><span className="today-timeline-row__copy"><strong>{place.name}</strong><small>{status === 'current' ? `Now · ${timeRange(day, place.id)}` : status === 'upcoming' ? timeRange(day, place.id) : labels[status]}</small></span><IconChevronDown size={18} /></button>;
}
