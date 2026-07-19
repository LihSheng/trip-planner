import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  AppShell,
  ActionIcon,
  Box,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  Skeleton,
  Stack,
  Tabs,
  Text,
  Tooltip,
  useMantineTheme,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconCalendarEvent,
  IconChevronLeft,
  IconChevronRight,
  IconInfoCircle,
  IconList,
  IconMap,
  IconMapPin,
} from '@tabler/icons-react';
import type { Place } from './types';
import { useAuth } from './context/AuthContext';
import { useTripPlanner } from './hooks/useTripPlanner';
import { AppHeader } from './components/AppHeader';
import { PlaceDetails } from './components/PlaceDetails';
import { PlaceFormModal } from './components/PlaceFormModal';
import { PlaceLibrary } from './components/PlaceLibrary';
import { PlannerBoard } from './components/PlannerBoard';
import { TripSettingsModal } from './components/TripSettingsModal';
import { ShareTripModal } from './components/ShareTripModal';
import { formatTripPlainText } from './utils/exportTrip';
import { useI18n } from './i18n';

const TaiwanMap = lazy(() =>
  import('./components/TaiwanMap').then((module) => ({ default: module.TaiwanMap })),
);

export default function App() {
  const planner = useTripPlanner();
  const { user, signOut } = useAuth();
  const { t } = useI18n();
  const mobileViews = [
    { label: t('map'), value: 'map' },
    { label: t('places'), value: 'places' },
    { label: t('planner'), value: 'planner' },
  ];
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const [selectedId, setSelectedId] = useState<string | null>(planner.state.places[0]?.id ?? null);
  const [activeMapView, setActiveMapView] = useState('all');
  const [desktopWorkspace, setDesktopWorkspace] = useState('map');
  const [mapPanelTab, setMapPanelTab] = useState<string | null>('details');
  const [mapPanelCollapsed, setMapPanelCollapsed] = useState(false);
  const [mobileView, setMobileView] = useState('map');
  const [editingPlace, setEditingPlace] = useState<Place | undefined>();
  const [placeModalOpened, setPlaceModalOpened] = useState(false);
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [shareOpened, setShareOpened] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Place | undefined>();
  const [dayDeleteTarget, setDayDeleteTarget] = useState<string | null>(null);

  const selectedPlace = useMemo(
    () => planner.state.places.find((place) => place.id === selectedId),
    [planner.state.places, selectedId],
  );

  useEffect(() => {
    if (!planner.isReady) return;
    if (selectedId && planner.state.places.some((place) => place.id === selectedId)) return;
    setSelectedId(planner.state.places[0]?.id ?? null);
  }, [planner.isReady, planner.state.places, selectedId]);

  if (!planner.isReady) {
    return (
      <Center mih="100vh">
        <Stack align="center" gap="sm">
          <Loader color="teal" />
          <Text size="sm" c="dimmed">{t('loadingTrip')}</Text>
        </Stack>
      </Center>
    );
  }

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
      notifications.show({ color: 'teal', title: t('placeUpdated'), message: t('placeSaved', { name: place.name }) });
    } else {
      planner.addPlace(place);
      setSelectedId(place.id);
      setActiveMapView('unscheduled');
      notifications.show({ color: 'teal', title: t('placeAdded'), message: t('placeReady', { name: place.name }) });
    }
  }

  function handleDeletePlace() {
    if (!deleteTarget) return;
    planner.removePlace(deleteTarget.id);
    if (selectedId === deleteTarget.id) setSelectedId(null);
    notifications.show({ color: 'red', title: t('placeRemoved'), message: t('placeDeleted', { name: deleteTarget.name }) });
    setDeleteTarget(undefined);
  }

  const dayToDelete = planner.state.days.find((day) => day.id === dayDeleteTarget);
  const dayToDeleteIndex = dayToDelete ? planner.state.days.indexOf(dayToDelete) : -1;

  function handleDeleteDay() {
    if (!dayToDelete) return;
    planner.removeDay(dayToDelete.id);
    notifications.show({
      color: 'orange',
      title: t('dayRemoved'),
      message: t('stopsMoved', { count: dayToDelete.placeIds.length }),
    });
    setDayDeleteTarget(null);
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

  async function copyItineraryText() {
    try {
      await navigator.clipboard.writeText(formatTripPlainText(planner.state));
      notifications.show({ color: 'teal', title: t('itineraryCopied'), message: t('itineraryCopiedMessage') });
    } catch {
      notifications.show({ color: 'red', title: t('copyFailed'), message: t('clipboardDenied') });
    }
  }

  function resetTrip() {
    planner.reset();
    setSelectedId('taipei-101');
    setActiveMapView('all');
    notifications.show({ title: t('demoRestored'), message: t('demoRestoredMessage') });
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
        onEditPlace={openEditPlace}
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
          setMobileView('map');
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
      visitedPlaceIds={planner.state.visitedPlaceIds}
      onSelect={setSelectedId}
      onAddDay={planner.addDay}
      onMove={planner.move}
      onLabelChange={planner.updateDayLabel}
      onRemoveDay={setDayDeleteTarget}
      onReorderDays={planner.reorderDays}
      onVisitedChange={planner.toggleVisited}
      onDayScheduleChange={planner.updateDaySchedule}
      onStopScheduleChange={planner.updateStopSchedule}
      onEditPlace={openEditPlace}
      onDeletePlace={setDeleteTarget}
    />
  );

  const mapWorkspace = (
    <Box className={`map-workspace${mapPanelCollapsed ? ' map-workspace--panel-collapsed' : ''}`}>
      {map}
      {mapPanelCollapsed ? (
        <Tooltip label="Show details panel" position="left">
          <ActionIcon
            variant="filled"
            color="teal"
            radius="xl"
            size="lg"
            className="map-side-panel-restore"
            aria-label="Show details panel"
            onClick={() => setMapPanelCollapsed(false)}
          >
            <IconChevronLeft size={20} />
          </ActionIcon>
        </Tooltip>
      ) : (
        <Paper withBorder radius="lg" className="map-side-panel">
          <Tooltip label="Minimize details panel" position="left">
            <ActionIcon
              variant="subtle"
              color="gray"
              radius="xl"
              className="map-side-panel__minimize"
              aria-label="Minimize details panel"
              onClick={() => setMapPanelCollapsed(true)}
            >
              <IconChevronRight size={19} />
            </ActionIcon>
          </Tooltip>
        <Tabs value={mapPanelTab} onChange={setMapPanelTab} keepMounted={false}>
          <Tabs.List grow>
            <Tabs.Tab value="details" leftSection={<IconInfoCircle size={15} />}>
              {t('details')}
            </Tabs.Tab>
            <Tabs.Tab value="places" leftSection={<IconList size={15} />}>
              {t('places')}
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="details" p="md">
            <Stack gap="md">
              <Group gap="xs" wrap="nowrap">
                <IconMapPin size={17} />
                <Text fw={750}>{t('selectedPlace')}</Text>
              </Group>
              <PlaceDetails place={selectedPlace} onEdit={openEditPlace} />
              {!selectedPlace ? (
                <Button variant="light" color="teal" onClick={openAddPlace}>
                  {t('addFirstPlace')}
                </Button>
              ) : null}
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="places" p="md">
            {placesPanel}
          </Tabs.Panel>
        </Tabs>
        </Paper>
      )}
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
          syncStatus={planner.syncStatus}
          syncError={planner.syncError}
          accountEmail={user.email}
          onAddPlace={openAddPlace}
          onOpenSettings={() => setSettingsOpened(true)}
          canShare={planner.isOwner}
          onOpenShare={() => setShareOpened(true)}
          onExport={exportTrip}
          onCopyPlainText={copyItineraryText}
          onReset={resetTrip}
          onSignOut={() => void signOut()}
        />
      </AppShell.Header>

      <AppShell.Main>
        <Container fluid px={{ base: 'sm', md: 'lg' }} py="lg" className="app-container">
          {isDesktop ? (
            <Stack gap="md">
              <Group justify="space-between" align="center" className="workspace-toolbar">
                <div>
                  <Text fw={800}>{t('tripWorkspace')}</Text>
                  <Text size="sm" c="dimmed">
                    {t('workspaceHint')}
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
                          <span>{t('map')}</span>
                        </Box>
                      ),
                    },
                    {
                      value: 'planner',
                      label: (
                        <Box className="workspace-tab-label">
                          <IconCalendarEvent size={15} />
                          <span>{t('planner')}</span>
                        </Box>
                      ),
                    },
                  ]}
                />
              </Group>
              {desktopWorkspace === 'map' ? mapWorkspace : plannerPanel}
            </Stack>
          ) : (
            <Stack gap="md" className="mobile-workspace">
              {mobileView === 'map' ? (
                <Stack gap="sm">
                  {map}
                  <Box className="mobile-place-details">
                    <PlaceDetails place={selectedPlace} onEdit={openEditPlace} />
                  </Box>
                </Stack>
              ) : null}
              {mobileView === 'places' ? placesPanel : null}
              {mobileView === 'planner' ? plannerPanel : null}
            </Stack>
          )}
        </Container>
      </AppShell.Main>
      <ShareTripModal opened={shareOpened} onClose={() => setShareOpened(false)} onPrepareCloudSignIn={planner.persistForCloudSignIn} />

      {!isDesktop ? (
        <Box component="nav" className="mobile-bottom-nav" aria-label={t('navigation')}>
          {mobileViews.map((item) => {
            const active = mobileView === item.value;
            const Icon =
              item.value === 'map' ? IconMap : item.value === 'places' ? IconList : IconCalendarEvent;
            return (
              <Button
                key={item.value}
                variant="subtle"
                color={active ? 'teal' : 'gray'}
                className="mobile-bottom-nav__item"
                data-active={active || undefined}
                onClick={() => setMobileView(item.value)}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={21} stroke={active ? 2.5 : 1.8} />
                <span>{item.label}</span>
              </Button>
            );
          })}
        </Box>
      ) : null}

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
      <Modal opened={Boolean(deleteTarget)} onClose={() => setDeleteTarget(undefined)} title={t('deletePlaceQuestion')} centered>
        <Stack>
          <Text size="sm">
            {t('removePlaceConfirm', { name: deleteTarget?.name ?? '' })}
          </Text>
          <Box className="modal-actions">
            <Button variant="default" onClick={() => setDeleteTarget(undefined)}>
              Cancel
            </Button>
            <Button color="red" onClick={handleDeletePlace}>
              {t('deletePlace')}
            </Button>
          </Box>
        </Stack>
      </Modal>
      <Modal opened={Boolean(dayToDelete)} onClose={() => setDayDeleteTarget(null)} title={t('removeDayQuestion')} centered>
        <Stack>
          <Text size="sm">
            {t('removeDayConfirm', { number: dayToDeleteIndex + 1, count: dayToDelete?.placeIds.length ?? 0 })}
          </Text>
          <Box className="modal-actions">
            <Button variant="default" onClick={() => setDayDeleteTarget(null)}>
              {t('cancel')}
            </Button>
            <Button color="red" onClick={handleDeleteDay}>
              {t('removeDay')}
            </Button>
          </Box>
        </Stack>
      </Modal>
    </AppShell>
  );
}
