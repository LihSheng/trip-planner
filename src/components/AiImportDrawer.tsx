import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Checkbox, Divider, Drawer, Group, NumberInput, Paper, Radio, Select, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import type { TripState } from '../types';
import type { AiImportRequest, AiItineraryDraft, ConfirmedAiDraft } from '../types/aiImport';
import { useAiImport } from '../hooks/useAiImport';

export function AiImportDrawer({ opened, onClose, state, onApply }: { opened: boolean; onClose: () => void; state: TripState; onApply: (confirmed: ConfirmedAiDraft) => void }) {
  const { draft, setDraft, loading, error, createDraft, reset } = useAiImport();
  const [content, setContent] = useState('');
  const [pace, setPace] = useState<'relaxed' | 'balanced' | 'packed'>('balanced');
  const [mergeMode, setMergeMode] = useState<'new-days' | 'unscheduled'>('new-days');
  const [requestedDays, setRequestedDays] = useState<number | undefined>();
  const request = useMemo<AiImportRequest>(() => ({
    source: { type: 'text', content }, preferences: { pace, mergeMode, requestedDays },
    existingTrip: { tripName: state.tripName, startDate: state.startDate, places: state.places.map(({ id, name, region, latitude, longitude }) => ({ id, name, region, latitude, longitude })) },
  }), [content, mergeMode, pace, requestedDays, state]);

  function close() { reset(); onClose(); }
  function setIncluded(tempId: string, included: boolean) {
    if (!draft) return;
    const update = (place: AiItineraryDraft['days'][number]['places'][number]) => place.tempId === tempId ? { ...place, included } : place;
    setDraft({ ...draft, days: draft.days.map((day) => ({ ...day, places: day.places.map(update) })), unscheduled: draft.unscheduled.map(update) });
  }
  const candidates = draft ? [...draft.days.flatMap((day) => day.places), ...draft.unscheduled] : [];
  const blocked = candidates.some((candidate) => candidate.included && !['resolved', 'existing-place'].includes(candidate.resolution));

  return <Drawer opened={opened} onClose={close} title={<Group gap="xs"><IconSparkles size={18} /><Text fw={700}>Import with AI</Text></Group>} position="right" size="lg">
    {!draft ? <Stack>
      <Text size="sm" c="dimmed">Paste an itinerary, article, chat message, or notes. AI creates a draft; nothing changes until you approve it.</Text>
      <Textarea label="Travel content" minRows={10} maxLength={30000} value={content} onChange={(event) => setContent(event.currentTarget.value)} placeholder="Day 1: Visit Taipei 101 at 10:00, then lunch at Din Tai Fung…" />
      <Group grow>
        <Select label="Pace" value={pace} onChange={(value) => setPace((value ?? 'balanced') as typeof pace)} data={['relaxed', 'balanced', 'packed']} />
        <NumberInput label="Days (optional)" min={1} max={14} value={requestedDays ?? ''} onChange={(value) => setRequestedDays(typeof value === 'number' ? value : undefined)} />
      </Group>
      <Radio.Group label="Add imported places" value={mergeMode} onChange={(value) => setMergeMode(value as typeof mergeMode)}>
        <Group mt="xs"><Radio value="new-days" label="As new days" /><Radio value="unscheduled" label="Unscheduled" /></Group>
      </Radio.Group>
      {error ? <Alert color="red">{error}</Alert> : null}
      <Button leftSection={<IconSparkles size={17} />} loading={loading} disabled={content.trim().length < 30} onClick={() => void createDraft(request)}>Create draft</Button>
    </Stack> : <Stack>
      <Title order={4}>Review your draft</Title>
      <Text size="sm">{draft.summary}</Text>
      {draft.warnings.map((warning) => <Alert key={warning} color="yellow">{warning}</Alert>)}
      {draft.days.map((day) => <Paper withBorder p="sm" key={day.tempId}><Text fw={700} mb="xs">{day.label}</Text><CandidateList places={day.places} onIncluded={setIncluded} /></Paper>)}
      {draft.unscheduled.length ? <Paper withBorder p="sm"><Text fw={700} mb="xs">Unscheduled</Text><CandidateList places={draft.unscheduled} onIncluded={setIncluded} /></Paper> : null}
      {blocked ? <Alert color="orange">Resolve or exclude every included ambiguous or unresolved place before importing.</Alert> : null}
      <Divider />
      <Group justify="flex-end"><Button variant="default" onClick={reset}>Back</Button><Button disabled={blocked || !candidates.some((candidate) => candidate.included)} onClick={() => { onApply({ draft, preferences: request.preferences }); close(); }}>Import selected places</Button></Group>
    </Stack>}
  </Drawer>;
}

function CandidateList({ places, onIncluded }: { places: AiItineraryDraft['days'][number]['places']; onIncluded: (id: string, included: boolean) => void }) {
  return <Stack gap="xs">{places.map((place) => <Paper key={place.tempId} withBorder p="xs"><Group justify="space-between" align="flex-start" wrap="nowrap"><Checkbox checked={place.included} onChange={(event) => onIncluded(place.tempId, event.currentTarget.checked)} label={<><Text size="sm" fw={600}>{place.name}</Text><Text size="xs" c="dimmed">{place.region} · {place.sourceEvidence}</Text></>} /><Badge color={place.resolution === 'resolved' || place.resolution === 'existing-place' ? 'teal' : 'orange'}>{place.resolution}</Badge></Group></Paper>)}</Stack>;
}
