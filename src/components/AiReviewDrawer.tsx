import { useEffect, useRef, useState } from 'react';
import { Alert, Anchor, Badge, Button, Drawer, Group, Paper, Progress, RingProgress, Stack, Text, Timeline, Title } from '@mantine/core';
import { IconArrowRight, IconCheck, IconClock, IconListCheck, IconSearch, IconStars, IconTrash } from '@tabler/icons-react';
import type { TripState } from '../types';
import { REVIEW_AREAS, isSuggestionCurrent, type AiReview, type Suggestion, type SuggestionChange } from '../domain/aiReview';
import { useTrip } from '../context/TripContext';
import { useI18n } from '../i18n';
import { showUndoableNotification } from '../lib/undoNotification';
import { mockAiReview } from '../lib/aiReviewMock';

type Phase = { name: 'idle' } | { name: 'running'; step: number } | { name: 'done'; review: AiReview };
type CardStatus = 'applied' | 'dismissed';

const RUN_STEPS = ['Reading your days', 'Searching the weather forecast', 'Checking opening hours', 'Estimating travel time', 'Writing suggestions'];
const SEVERITY_COLOR = { high: 'red', medium: 'orange', low: 'blue' } as const;

function scoreColor(score: number) { return score < 5 ? 'red' : score < 7 ? 'orange' : 'teal'; }

function dayName(state: TripState, dayId: string) {
  const index = state.days.findIndex((day) => day.id === dayId);
  return state.days[index]?.label || `Day ${index + 1}`;
}

function describeChange(state: TripState, change: SuggestionChange) {
  const name = (placeId: string) => state.places.find((place) => place.id === placeId)?.name ?? 'a visit';
  switch (change.kind) {
    case 'move-visit': return { icon: IconArrowRight, text: `Move ${name(change.placeId)} from ${dayName(state, change.fromDayId)} to ${dayName(state, change.toDayId)}${change.afterPlaceId ? `, after ${name(change.afterPlaceId)}` : ', at the start'}` };
    case 'set-time': return { icon: IconClock, text: `Start ${name(change.placeId)} at ${change.startTime}` };
    case 'remove-visit': return { icon: IconTrash, text: `Remove ${name(change.placeId)} from ${dayName(state, change.dayId)}` };
    case 'add-task': return { icon: IconListCheck, text: `Add task on ${dayName(state, change.dayId)}: ${change.text}` };
  }
}

export function AiReviewDrawer({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { state, move, updateStopSchedule, removePlannerVisit, addDayTask, markUndoPoint, undo } = useTrip();
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [statuses, setStatuses] = useState<Record<string, CardStatus>>({});
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function run() {
    window.clearTimeout(timer.current);
    setStatuses({});
    const tick = (step: number) => {
      if (step < RUN_STEPS.length) {
        setPhase({ name: 'running', step });
        timer.current = window.setTimeout(() => tick(step + 1), 650);
      } else setPhase({ name: 'done', review: mockAiReview(state) });
    };
    tick(0);
  }

  function close() { window.clearTimeout(timer.current); setPhase({ name: 'idle' }); setStatuses({}); onClose(); }

  function apply(suggestion: Suggestion) {
    markUndoPoint(suggestion.title);
    for (const change of suggestion.changes) {
      if (change.kind === 'move-visit') {
        const target = state.days.find((day) => day.id === change.toDayId)?.placeIds ?? [];
        const afterIndex = change.afterPlaceId ? target.indexOf(change.afterPlaceId) : -1;
        move(change.placeId, change.toDayId, change.afterPlaceId === null ? 0 : afterIndex < 0 ? target.length : afterIndex + 1);
      } else if (change.kind === 'set-time') updateStopSchedule(change.dayId, change.placeId, { startTime: change.startTime });
      else if (change.kind === 'remove-visit') removePlannerVisit(change.placeId, change.dayId);
      else addDayTask(change.dayId, change.text);
    }
    setStatuses((current) => ({ ...current, [suggestion.id]: 'applied' }));
    showUndoableNotification({
      title: 'Suggestion applied', message: suggestion.title, t,
      onUndo: () => { undo(); setStatuses((current) => { const { [suggestion.id]: _, ...rest } = current; return rest; }); },
    });
  }

  return <Drawer opened={opened} onClose={close} title={<Group gap="xs"><IconStars size={18} /><Text fw={700}>Review trip</Text></Group>} position="right" size="lg" zIndex={2000}>
    {phase.name === 'idle' ? <Stack>
      <Text size="sm" c="dimmed">Claude reads your days, checks the weather and opening hours on the web, and suggests changes. Nothing changes until you press Apply on a suggestion.</Text>
      <Group><Button leftSection={<IconStars size={17} />} onClick={run}>Review trip</Button><Text size="xs" c="dimmed">Uses 1 of your 20 daily AI runs</Text></Group>
      <Alert color="gray" variant="light">Prototype: the review is generated locally from your trip. No AI is called.</Alert>
    </Stack> : null}

    {phase.name === 'running' ? <Stack>
      <Timeline active={phase.step} bulletSize={22} lineWidth={2}>
        {RUN_STEPS.map((step, index) => <Timeline.Item key={step} bullet={index < phase.step ? <IconCheck size={12} /> : index === 1 || index === 2 ? <IconSearch size={12} /> : null} title={<Text size="sm" c={index > phase.step ? 'dimmed' : undefined}>{step}</Text>} />)}
      </Timeline>
      <Group><Button variant="default" onClick={() => { window.clearTimeout(timer.current); setPhase({ name: 'idle' }); }}>Cancel</Button><Text size="xs" c="dimmed">Your trip will not change.</Text></Group>
    </Stack> : null}

    {phase.name === 'done' ? <Stack>
      <Group align="center" wrap="nowrap" gap="lg">
        <RingProgress size={104} thickness={9} roundCaps sections={[{ value: phase.review.overall * 10, color: scoreColor(phase.review.overall) }]}
          label={<Text ta="center" fw={800} size="xl">{phase.review.overall}<Text span size="xs" c="dimmed">/10</Text></Text>} />
        <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
          {REVIEW_AREAS.map((area) => <Group key={area} gap="xs" wrap="nowrap">
            <Text size="xs" w={92}>{area}</Text>
            <Progress value={phase.review.scores[area] * 10} color={scoreColor(phase.review.scores[area])} size="sm" style={{ flex: 1 }} />
            <Text size="xs" c="dimmed" w={16} ta="right">{phase.review.scores[area]}</Text>
          </Group>)}
        </Stack>
      </Group>
      <Text size="sm">{phase.review.summary}</Text>

      {phase.review.notes.map((note) => <Alert key={note.text} color="blue" variant="light" title={note.dayId ? dayName(state, note.dayId) : undefined}>
        <Text size="sm">{note.text}</Text>
        {note.sources.map((source) => <Anchor key={source.url} href={source.url} target="_blank" size="xs">{source.title}</Anchor>)}
      </Alert>)}

      <Title order={5} mt="xs">Suggestions</Title>
      {phase.review.suggestions.map((suggestion) => {
        const status = statuses[suggestion.id];
        const current = isSuggestionCurrent(state, suggestion);
        return <Paper key={suggestion.id} withBorder p="sm" radius="md" opacity={status === 'dismissed' ? 0.55 : 1}
          style={{ borderLeft: `3px solid var(--mantine-color-${SEVERITY_COLOR[suggestion.severity]}-6)`, background: status === 'applied' ? 'var(--mantine-color-teal-light)' : undefined }}>
          <Stack gap={6}>
            <Text fw={650} size="sm">{suggestion.title}</Text>
            <Text size="xs" c="dimmed">{suggestion.reason}</Text>
            <Stack gap={2}>
              {suggestion.changes.map((change, index) => { const { icon: Icon, text } = describeChange(state, change); return <Group key={index} gap={6} wrap="nowrap"><Icon size={14} /><Text size="xs" ff="monospace">{text}</Text></Group>; })}
            </Stack>
            {suggestion.sources.length ? <Group gap="xs">{suggestion.sources.map((source) => <Anchor key={source.url} href={source.url} target="_blank" size="xs">{source.title}</Anchor>)}</Group> : null}
            <Group gap="xs" mt={4}>
              {status === 'applied' ? <Badge color="teal" variant="light" leftSection={<IconCheck size={12} />}>Applied</Badge>
                : status === 'dismissed' ? <Button size="compact-sm" variant="subtle" onClick={() => setStatuses(({ [suggestion.id]: _, ...rest }) => rest)}>Restore</Button>
                : !current ? <Text size="xs" c="orange">Out of date. Run the review again.</Text>
                : <><Button size="compact-sm" onClick={() => apply(suggestion)}>Apply</Button><Button size="compact-sm" variant="subtle" color="gray" onClick={() => setStatuses((s) => ({ ...s, [suggestion.id]: 'dismissed' }))}>Dismiss</Button></>}
            </Group>
          </Stack>
        </Paper>;
      })}
      <Group justify="space-between" mt="xs"><Text size="xs" c="dimmed">This review is not saved.</Text><Button variant="default" onClick={run}>Run again</Button></Group>
    </Stack> : null}
  </Drawer>;
}
