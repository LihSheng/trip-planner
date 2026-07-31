import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Checkbox, Divider, Drawer, Group, NativeSelect, NumberInput, Paper, Radio, SegmentedControl, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import type { PlaceCategory } from '../types';
import type { AiImportRequest, AiItineraryDraft, AiResolvedPlace, ConfirmedAiDraft } from '../types/aiImport';
import { useAiImport } from '../hooks/useAiImport';
import { useTrip } from '../context/TripContext';
import { PLACE_CATEGORIES, validatePlaceDetails } from '../domain/place';

export function AiImportDrawer({ opened, onClose, onApply }: { opened: boolean; onClose: () => void; onApply: (confirmed: ConfirmedAiDraft) => void }) {
  const { planId } = useTrip();
  const { draft, setDraft, loading, error, createDraft, cancel, reset } = useAiImport();
  const [sourceType, setSourceType] = useState<'text' | 'url'>('text');
  const [content, setContent] = useState('');
  const [pace, setPace] = useState<'relaxed' | 'balanced' | 'packed'>('balanced');
  const [mergeMode, setMergeMode] = useState<'new-days' | 'unscheduled'>('unscheduled');
  const [requestedDays, setRequestedDays] = useState<number | undefined>();
  const request = useMemo<AiImportRequest>(() => ({
    planId: planId ?? '',
    source: sourceType === 'text' ? { type: 'text', content } : { type: 'url', url: content }, preferences: { pace, mergeMode, requestedDays },
  }), [content, mergeMode, pace, planId, requestedDays, sourceType]);

  function close() { reset(); onClose(); }
  function setIncluded(tempId: string, included: boolean) {
    updateCandidate(tempId, { included });
  }
  function updateCandidate(tempId: string, updates: Partial<AiResolvedPlace>) {
    if (!draft) return;
    const update = (place: AiResolvedPlace) => place.tempId === tempId ? { ...place, ...updates } : place;
    setDraft({ ...draft, days: draft.days.map((day) => ({ ...day, places: day.places.map(update) })), unscheduled: draft.unscheduled.map(update) });
  }
  const candidates = draft ? [...draft.days.flatMap((day) => day.places), ...draft.unscheduled] : [];
  const blocked = candidates.some((candidate) => candidate.included && !isCandidateValid(candidate));

  return <Drawer opened={opened} onClose={close} title={<Group gap="xs"><IconSparkles size={18} /><Text fw={700}>Import with AI</Text></Group>} position="right" size="lg" zIndex={2000}>
    {!draft ? <Stack>
      <Text size="sm" c="dimmed">Paste an itinerary, article, chat message, or notes. AI fills an editable place preview. Your trip is saved only after you review it and create the draft.</Text>
      <SegmentedControl value={sourceType} onChange={(value) => { setSourceType(value as typeof sourceType); setContent(''); }} data={[{ value: 'text', label: 'Paste text' }, { value: 'url', label: 'Paste link' }]} />
      {sourceType === 'text'
        ? <Textarea label="Travel content" minRows={10} maxLength={30000} value={content} onChange={(event) => setContent(event.currentTarget.value)} placeholder="Day 1: Visit Taipei 101 at 10:00, then lunch at Din Tai Fung…" />
        : <TextInput label="Approved public link" description="Google Maps links are enabled by default. Other domains require server approval." maxLength={2048} value={content} onChange={(event) => setContent(event.currentTarget.value)} placeholder="https://maps.app.goo.gl/..." />}
      <Group grow>
        <NativeSelect label="Pace" value={pace} onChange={(event) => setPace(event.currentTarget.value as typeof pace)} data={['relaxed', 'balanced', 'packed']} />
        <NumberInput label="Days (optional)" min={1} max={14} value={requestedDays ?? ''} onChange={(value) => setRequestedDays(typeof value === 'number' ? value : undefined)} />
      </Group>
      <Radio.Group label="Add imported places" value={mergeMode} onChange={(value) => setMergeMode(value as typeof mergeMode)}>
        <Group mt="xs"><Radio value="new-days" label="As new days" /><Radio value="unscheduled" label="Unscheduled" /></Group>
      </Radio.Group>
      {!planId ? <Alert color="orange">Select a cloud trip plan before importing.</Alert> : null}
      {error ? <Alert color="red">{error}</Alert> : null}
      {loading ? <Alert color="blue">Creating a draft. You can cancel safely; your trip will not change.</Alert> : null}
      <Group grow>
        <Button leftSection={<IconSparkles size={17} />} loading={loading} disabled={!planId || loading || (sourceType === 'text' ? content.trim().length < 30 : !/^https?:\/\//i.test(content.trim()))} onClick={() => void createDraft(request)}>Preview places</Button>
        {loading ? <Button variant="default" onClick={cancel}>Cancel</Button> : null}
      </Group>
    </Stack> : <Stack>
      <Title order={4}>Review and edit places</Title>
      <Text size="sm" c="dimmed">Check the recognized details below. Nothing has been added to your trip yet.</Text>
      {draft.sourceTitle ? <Text size="sm" c="dimmed">Source: {draft.sourceTitle}</Text> : null}
      <Text size="sm">{draft.summary}</Text>
      {draft.warnings.map((warning) => <Alert key={warning} color="yellow">{warning}</Alert>)}
      {draft.days.map((day) => <Paper withBorder p="sm" key={day.tempId}><Text fw={700} mb="xs">{day.label}</Text><CandidateList places={day.places} onIncluded={setIncluded} onChange={updateCandidate} /></Paper>)}
      {draft.unscheduled.length ? <Paper withBorder p="sm"><Text fw={700} mb="xs">Unscheduled</Text><CandidateList places={draft.unscheduled} onIncluded={setIncluded} onChange={updateCandidate} /></Paper> : null}
      {blocked ? <Alert color="orange">Complete the name, region, latitude, and longitude for every included place, or exclude it.</Alert> : null}
      <Divider />
      <Group justify="flex-end"><Button variant="default" onClick={reset}>Back</Button><Button disabled={blocked || !candidates.some((candidate) => candidate.included)} onClick={() => { onApply({ draft, preferences: request.preferences }); setContent(''); close(); }}>Create draft</Button></Group>
    </Stack>}
  </Drawer>;
}

export function isCandidateValid(place: AiResolvedPlace) {
  if (place.resolution === 'existing-place' && place.existingPlaceId) return true;
  return Object.keys(validatePlaceDetails({
    name: place.name,
    region: place.region,
    category: place.category,
    latitude: place.latitude ?? '',
    longitude: place.longitude ?? '',
    notes: place.notes,
    opensAt: place.openingHours?.opensAt ?? '',
    closesAt: place.openingHours?.closesAt ?? '',
    checkInDate: place.stay?.checkInDate ?? '',
    checkOutDate: place.stay?.checkOutDate ?? '',
  })).length === 0;
}

export function CandidateList({ places, onIncluded, onChange }: {
  places: AiItineraryDraft['days'][number]['places'];
  onIncluded: (id: string, included: boolean) => void;
  onChange: (id: string, updates: Partial<AiResolvedPlace>) => void;
}) {
  return <Stack gap="sm">{places.map((place) => {
    const valid = isCandidateValid(place);
    const existing = place.resolution === 'existing-place' && Boolean(place.existingPlaceId);
    const detailsDisabled = !place.included || existing;
    return <Paper key={place.tempId} withBorder p="sm">
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Checkbox checked={place.included} onChange={(event) => onIncluded(place.tempId, event.currentTarget.checked)} label="Include this place" />
          <Badge color={valid ? 'teal' : 'orange'}>{valid ? 'ready' : 'needs details'}</Badge>
        </Group>
        <Text fw={700} size="sm">Place details</Text>
        {existing ? <Alert color="blue">Uses the existing saved place. Place details will not be overwritten.</Alert> : null}
        <NativeSelect
          label="Category"
          description="How this place is grouped and displayed"
          data={PLACE_CATEGORIES}
          value={place.category}
          onChange={(event) => onChange(place.tempId, { category: event.currentTarget.value as PlaceCategory })}
          disabled={detailsDisabled}
        />
        <TextInput label="Place name" required value={place.name} error={place.included && !existing && place.name.trim().length < 2 ? 'Enter a place name' : undefined} onChange={(event) => onChange(place.tempId, { name: event.currentTarget.value })} disabled={detailsDisabled} />
        <TextInput label="Region / city" required value={place.region} error={place.included && !existing && place.region.trim().length < 2 ? 'Enter a region or city' : undefined} onChange={(event) => onChange(place.tempId, { region: event.currentTarget.value })} disabled={detailsDisabled} />
        <Group grow align="flex-start">
          <NumberInput label="Latitude" required decimalScale={6} value={place.latitude ?? ''} error={place.included && !existing && (typeof place.latitude !== 'number' || place.latitude < -90 || place.latitude > 90) ? 'Enter -90 to 90' : undefined} onChange={(value) => onChange(place.tempId, { latitude: typeof value === 'number' ? value : undefined })} disabled={detailsDisabled} />
          <NumberInput label="Longitude" required decimalScale={6} value={place.longitude ?? ''} error={place.included && !existing && (typeof place.longitude !== 'number' || place.longitude < -180 || place.longitude > 180) ? 'Enter -180 to 180' : undefined} onChange={(value) => onChange(place.tempId, { longitude: typeof value === 'number' ? value : undefined })} disabled={detailsDisabled} />
        </Group>
        {place.category === 'Accommodation'
          ? <Group grow align="flex-start">
              <TextInput
                label="Check-in date"
                type="date"
                value={place.stay?.checkInDate ?? ''}
                onChange={(event) => onChange(place.tempId, { stay: { checkInDate: event.currentTarget.value, checkOutDate: place.stay?.checkOutDate ?? '' } })}
                disabled={detailsDisabled}
              />
              <TextInput
                label="Check-out date"
                type="date"
                min={place.stay?.checkInDate || undefined}
                value={place.stay?.checkOutDate ?? ''}
                error={place.stay?.checkInDate && place.stay?.checkOutDate && place.stay.checkOutDate < place.stay.checkInDate ? 'Must be on or after check-in' : undefined}
                onChange={(event) => onChange(place.tempId, { stay: { checkInDate: place.stay?.checkInDate ?? '', checkOutDate: event.currentTarget.value } })}
                disabled={detailsDisabled}
              />
            </Group>
          : <Group grow align="flex-start">
              <TextInput label="Opens at" type="time" value={place.openingHours?.opensAt ?? ''} onChange={(event) => onChange(place.tempId, { openingHours: { opensAt: event.currentTarget.value, closesAt: place.openingHours?.closesAt ?? '' } })} disabled={detailsDisabled} />
              <TextInput label="Closes at" type="time" value={place.openingHours?.closesAt ?? ''} onChange={(event) => onChange(place.tempId, { openingHours: { opensAt: place.openingHours?.opensAt ?? '', closesAt: event.currentTarget.value } })} disabled={detailsDisabled} />
            </Group>}
        <Textarea label="Notes" autosize minRows={2} value={place.notes} onChange={(event) => onChange(place.tempId, { notes: event.currentTarget.value })} disabled={detailsDisabled} />
        <Text fw={700} size="sm">Schedule details (optional)</Text>
        <Group grow align="flex-start">
          <TextInput label="Start time" type="time" value={place.suggestedStartTime ?? ''} onChange={(event) => onChange(place.tempId, { suggestedStartTime: event.currentTarget.value || undefined })} disabled={!place.included} />
          <NumberInput label="Duration in minutes" min={1} value={place.durationMinutes ?? ''} onChange={(value) => onChange(place.tempId, { durationMinutes: typeof value === 'number' ? value : undefined })} disabled={!place.included} />
        </Group>
        <Text size="xs" c="dimmed">Recognized from: {place.sourceEvidence}</Text>
      </Stack>
    </Paper>;
  })}</Stack>;
}
