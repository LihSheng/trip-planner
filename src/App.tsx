import { lazy, Suspense, useMemo, useState } from 'react';
import {
  AppShell,
  Box,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  SegmentedControl,
  Skeleton,
  Stack,
  Tabs,
  Text,
  useMantineTheme,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconCalendarEvent, IconInfoCircle, IconList, IconMap, IconMapPin } from '@tabler/icons-react';
import type { Place } from './types';
import { useTripPlanner } from './hooks/useTripPlanner';
import { AppHeader } from './components/AppHeader';
import { PlaceDetails } from './components/PlaceDetails';
import { PlaceFormModal } from './components/PlaceFormModal';
import { PlaceLibrary } from './components/PlaceLibrary';
import { PlannerBoard } from './components/PlannerBoard';
import { TripSettingsModal } from './components/TripSettingsModal';

const TaiwanMap = lazy(() =>
  import('./components/TaiwanMap').then((module) => ({ default: module.TaiwanMap })),
);

const mobileViews = [
  { label: 'Map', value: 'map' },
  { label: 'Places', value: 'places' },
  { label: 'Planner', value: 'planner' },
];

export default function App() {
  const planner = useTripPlanner();
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const [selectedId, setSelectedId] = useState<string | null>(planner.state.places[0]?.id ?? null);
  const [activeMapView, setActiveMapView] = useState('all');
  const [desktopWorkspace, setDesktopWorkspace] = useState('map');
  const [mapPanelTab, setMapPanelTab] = useState<string | null>('details');
  const [mobileView, setMobileView] = useState('map');
  const [editingPlace, setEditingPlace] = useState<Place | undefined>();
  const [placeModalOpened, setPlaceModalOpened] = useState(false);
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Place | undefined>();

  const selectedPlace = useMemo(
    () => planner.state.places.find((place) => place.id === selectedId),
    [planner.state.places, selectedId],
  );

  function openAddPlace() {
    setEditingPlace(undefined);
    setPlaceModalOpened(true);
  }

  function openEditPlace(place: Place) {
    setEditingPlace(place);
    setPlaceModalOpened(true);
  }

  function handlePlaceSubmit(place: Place) {
    if (editingPlace) {
      planner.updatePlace(place);
      notifications.show({ color: 'teal', title: 'Place updated', message: `${place.name} was saved.` });
    } else {
      planner.addPlace(place);
      setSelectedId(place.id);
      setActiveMapView('unscheduled');
      notifications.show({ color: 'teal', title: 'Place added', message: `${place.name} is ready to schedule.` });
    }
  }

  function handleDeletePlace() {
    if (!deleteTarget) return;
    planner.removePlace(deleteTarget.id);
    if (selectedId === deleteTarget.id) setSelectedId(null);
    notifications.show({ color: 'red', title: 'Place removed', message: `${deleteTarget.name} was deleted.` });
    setDeleteTarget(undefined);
  }

  function handleMapViewChange(viewId: string) {
    setActiveMapView(viewId);

    const nextSelectedId =
      viewId === 'all'
        ? selectedId ?? planner.state.places[0]?.id
        : viewId === 'unscheduled'
          ? planner.state.unscheduledIds[0]
          : planner.state.days.find((day) => day.id === viewId)?.placeIds[0];

    setSelectedId(nextSelectedId ?? null);
  }

  function exportTrip() {
    const payload = JSON.stringify(planner.state, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${planner.state.tripName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'trip'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function resetTrip() {
    planner.reset();
    setSelectedId('taipei-101');
    setActiveMapView('all');
    notifications.show({ title: 'Demo restored', message: 'The sample Taiwan trip has been reset.' });
  }

  const map = (
    <Suspense fallback={<Skeleton height="calc(100vh - 176px)" mih={560} radius="lg" />}>
      <TaiwanMap
        places={planner.state.places}
        days={planner.state.days}
        unscheduledIds={planner.state.unscheduledIds}
        startDate={planner.state.startDate}
        selectedId={selectedId}
        activeView={activeMapView}
        onSelect={setSelectedId}
        onActiveViewChange={handleMapViewChange}
        onAddDay={planner.addDay}
      />
    </Suspense>
  );

  const placesPanel = (
    <Box className="library-panel">
      <PlaceLibrary
        places={planner.state.places}
        selectedId={selectedId}
        onSelect={(placeId) => {
          setSelectedId(placeId);
          setActiveMapView('all');
          setMapPanelTab('details');
        }}
        onAdd={openAddPlace}
        onEdit={openEditPlace}
        onDelete={setDeleteTarget}
      />
    </Box>
  );

  const plannerPanel = (
    <PlannerBoard
      state={planner.state}
      placesById={planner.placesById}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onAddDay={planner.addDay}
      onMove={planner.move}
      onLabelChange={planner.updateDayLabel}
      onRemoveDay={planner.removeDay}
      onEditPlace={openEditPlace}
      onDeletePlace={setDeleteTarget}
    />
  );

  const mapWorkspace = (
    <Box className="map-workspace">
      {map}
      <Paper withBorder radius="lg" className="map-side-panel">
        <Tabs value={mapPanelTab} onChange={setMapPanelTab} keepMounted={false}>
          <Tabs.List grow>
            <Tabs.Tab value="details" leftSection={<IconInfoCircle size={15} />}>
              Details
            </Tabs.Tab>
            <Tabs.Tab value="places" leftSection={<IconList size={15} />}>
              Places
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="details" p="md">
            <Stack gap="md">
              <Group gap="xs" wrap="nowrap">
                <IconMapPin size={17} />
                <Text fw={750}>Selected place</Text>
              </Group>
              <PlaceDetails place={selectedPlace} onEdit={openEditPlace} />
              {!selectedPlace ? (
                <Button variant="light" color="teal" onClick={openAddPlace}>
                  Add your first place
                </Button>
              ) : null}
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="places" p="md">
            {placesPanel}
          </Tabs.Panel>
        </Tabs>
      </Paper>
    </Box>
  );

  return (
    <AppShell header={{ height: 72 }} padding={0}>
      <AppShell.Header>
        <AppHeader
          tripName={planner.state.tripName}
          startDate={planner.state.startDate}
          placeCount={planner.state.places.length}
          dayCount={planner.state.days.length}
          onAddPlace={openAddPlace}
          onOpenSettings={() => setSettingsOpened(true)}
          onExport={exportTrip}
          onReset={resetTrip}
        />
      </AppShell.Header>

      <AppShell.Main>
        <Container fluid px={{ base: 'sm', md: 'lg' }} py="lg" className="app-container">
          {isDesktop ? (
            <Stack gap="md">
              <Group justify="space-between" align="center" className="workspace-toolbar">
                <div>
                  <Text fw={800}>Trip workspace</Text>
                  <Text size="sm" c="dimmed">
                    Explore on the map or fine-tune the full itinerary board.
                  </Text>
                </div>
                <SegmentedControl
                  value={desktopWorkspace}
                  onChange={setDesktopWorkspace}
                  data={[
                    {
                      value: 'map',
                      label: (
                        <Box className="workspace-tab-label">
                          <IconMap size={15} />
                          <span>Map</span>
                        </Box>
                      ),
                    },
                    {
                      value: 'planner',
                      label: (
                        <Box className="workspace-tab-label">
                          <IconCalendarEvent size={15} />
                          <span>Planner</span>
                        </Box>
                      ),
                    },
                  ]}
                />
              </Group>
              {desktopWorkspace === 'map' ? mapWorkspace : plannerPanel}
            </Stack>
          ) : (
            <Stack gap="md">
              <SegmentedControl
                value={mobileView}
                onChange={setMobileView}
                fullWidth
                data={mobileViews.map((item) => ({
                  value: item.value,
                  label: (
                    <Box className="mobile-tab-label">
                      {item.value === 'map' ? <IconMap size={15} /> : null}
                      {item.value === 'places' ? <IconList size={15} /> : null}
                      {item.value === 'planner' ? <IconCalendarEvent size={15} /> : null}
                      <span>{item.label}</span>
                    </Box>
                  ),
                }))}
              />
              {mobileView === 'map' ? (
                <Stack gap="md">
                  {map}
                  <PlaceDetails place={selectedPlace} onEdit={openEditPlace} />
                </Stack>
              ) : null}
              {mobileView === 'places' ? placesPanel : null}
              {mobileView === 'planner' ? plannerPanel : null}
            </Stack>
          )}
        </Container>
      </AppShell.Main>

      <PlaceFormModal
        opened={placeModalOpened}
        place={editingPlace}
        onClose={() => setPlaceModalOpened(false)}
        onSubmit={handlePlaceSubmit}
      />
      <TripSettingsModal
        opened={settingsOpened}
        tripName={planner.state.tripName}
        startDate={planner.state.startDate}
        onClose={() => setSettingsOpened(false)}
        onSubmit={planner.updateTrip}
      />
      <Modal opened={Boolean(deleteTarget)} onClose={() => setDeleteTarget(undefined)} title="Delete place?" centered>
        <Stack>
          <Text size="sm">
            Remove <strong>{deleteTarget?.name}</strong> from the map and every itinerary day?
          </Text>
          <Box className="modal-actions">
            <Button variant="default" onClick={() => setDeleteTarget(undefined)}>
              Cancel
            </Button>
            <Button color="red" onClick={handleDeletePlace}>
              Delete place
            </Button>
          </Box>
        </Stack>
      </Modal>
    </AppShell>
  );
}
