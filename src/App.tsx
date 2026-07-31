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
  List,
  Modal,
  Paper,
  Radio,
  SegmentedControl,
  Select,
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
  IconReceipt,
  IconSun,
} from '@tabler/icons-react';
import type { Place } from './types';
import { useAuth } from './context/AuthContext';
import { useTrip } from './context/TripContext';
import { AppHeader } from './components/AppHeader';
import { ActivityEditorModal } from './components/ActivityEditorModal';
import { PlaceDetails } from './components/PlaceDetails';
import { PlaceFormModal } from './components/PlaceFormModal';
import { PlaceLibrary } from './components/PlaceLibrary';
import { PlannerBoard } from './components/PlannerBoard';
import { TripSettingsModal } from './components/TripSettingsModal';
import { ShareTripModal } from './components/ShareTripModal';
import { TodayModePage } from './components/TodayModePage';
import { ExpensesPage } from './components/ExpensesPage';
import { StayBookingModal } from './components/BookingModals';
import { AiImportDrawer } from './components/AiImportDrawer';
import { formatTripPlainText } from './utils/exportTrip';
import { useCurrentLocation } from './hooks/useCurrentLocation';
import { useI18n } from './i18n';
import { isPlaceholder } from './domain/place';
import type { ClusterAssignment } from './domain/locationCluster';

const TaiwanMap = lazy(() =>
  import('./components/TaiwanMap').then((module) => ({ default: module.TaiwanMap })),
);

export default function App() {
  const planner = useTrip();
  const { user, signOut } = useAuth();
  const { t } = useI18n();
  const location = useCurrentLocation();
  const mobileViews = [
    { label: 'Today', value: 'today' },
    { label: t('map'), value: 'map' },
    { label: t('places'), value: 'places' },
    { label: t('planner'), value: 'planner' },
    { label: t('expenses'), value: 'expenses' },
  ];
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const [selectedId, setSelectedId] = useState<string | null>(planner.state.places[0]?.id ?? null);
  const [activeMapView, setActiveMapView] = useState('all');
  const [desktopWorkspace, setDesktopWorkspace] = useState('map');
  const [mapPanelTab, setMapPanelTab] = useState<string | null>('details');
  const [mapPanelCollapsed, setMapPanelCollapsed] = useState(false);
  const [mobileView, setMobileView] = useState('today');
  const [editingPlace, setEditingPlace] = useState<Place | undefined>();
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [addPlaceDayId, setAddPlaceDayId] = useState<string | null>(null);
  const [replacePlaceholderId, setReplacePlaceholderId] = useState<string | null>(null);
  const [placeModalOpened, setPlaceModalOpened] = useState(false);
  const [addStayPlaceId, setAddStayPlaceId] = useState<string | null>(null);
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [shareOpened, setShareOpened] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Place | undefined>();
  const [dayDeleteTarget, setDayDeleteTarget] = useState<string | null>(null);
  const [aiImportOpened, setAiImportOpened] = useState(false);
  const [clusterDeleteMode, setClusterDeleteMode] = useState<'replace' | 'ungroup' | 'all'>('replace');
  const [replacementAnchorId, setReplacementAnchorId] = useState<string | null>(null);

  const selectedPlace = useMemo(
    () => planner.state.places.find((place) => place.id === selectedId),
    [planner.state.places, selectedId],
  );
  const mapPlaces = useMemo(
    () => planner.state.places.filter((place) => !isPlaceholder(place) && !place.assignmentOf),
    [planner.state.places],
  );

  const editingActivity = editingActivityId ? planner.activitiesById.get(editingActivityId) : undefined;
  const editingActivityPlace = editingActivity?.placeId ? planner.placesById.get(editingActivity.placeId) : undefined;

  useEffect(() => {
    if (!planner.isReady) return;
    if (selectedId && planner.state.places.some((place) => place.id === selectedId)) return;
    setSelectedId(planner.state.places[0]?.id ?? null);
  }, [planner.isReady, planner.state.places, selectedId]);

  useEffect(() => {
    if (!planner.planId || planner.isReadOnly) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('plan') === planner.planId) return;
    url.searchParams.set('plan', planner.planId);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [planner.isReadOnly, planner.planId]);

  const deleteAssignments = useMemo(() => {
    if (!deleteTarget) return [];
    const linkedIds = new Set(
      planner.state.places
        .filter((place) => place.id === deleteTarget.id || place.assignmentOf === deleteTarget.id)
        .map((place) => place.id),
    );
    return planner.state.days.flatMap((day, index) =>
      day.placeIds.filter((placeId) => linkedIds.has(placeId)).map((placeId) => ({
        day: t('day', { number: index + 1 }),
        placeName: planner.placesById.get(placeId)?.name ?? deleteTarget.name,
      })),
    );
  }, [deleteTarget, planner.placesById, planner.state.days, planner.state.places, t]);
  const deleteCluster = useMemo(
    () => deleteTarget
      ? planner.state.locationClusters?.find((cluster) => cluster.anchorPlaceId === deleteTarget.id)
      : undefined,
    [deleteTarget, planner.state.locationClusters],
  );

  useEffect(() => {
    setClusterDeleteMode('replace');
    setReplacementAnchorId(deleteCluster?.members[0]?.placeId ?? null);
  }, [deleteCluster?.id]);

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
    if (planner.isReadOnly) return;
    setEditingPlace(undefined);
    setAddPlaceDayId(null);
    setReplacePlaceholderId(null);
    setPlaceModalOpened(true);
  }

  function openAddPlaceForDay(dayId: string) {
    if (planner.isReadOnly) return;
    setEditingPlace(undefined);
    setAddPlaceDayId(dayId);
    setReplacePlaceholderId(null);
    setPlaceModalOpened(true);
  }

  function openEditPlace(place: Place) {
    if (planner.isReadOnly) return;
    setEditingPlace(place);
    setAddPlaceDayId(null);
    setReplacePlaceholderId(null);
    setPlaceModalOpened(true);
  }

  function openEditActivity(place: Place) {
    if (planner.isReadOnly || isPlaceholder(place)) return;
    setSelectedId(place.id);
    setEditingActivityId(place.id);
  }

  function handlePlaceSubmit(place: Place, clusterAssignment?: ClusterAssignment) {
    if (planner.isReadOnly) return;
    if (editingPlace) {
      planner.updatePlace(place);
      const editedCluster = planner.state.locationClusters?.find((cluster) => cluster.anchorPlaceId === place.id || cluster.members.some((member) => member.placeId === place.id));
      if (editedCluster?.anchorPlaceId !== place.id) {
        planner.setPlaceCluster(place.id, clusterAssignment?.targetPlaceId, clusterAssignment?.relationship, clusterAssignment?.travelMinutes, clusterAssignment?.travelMode);
      }
      notifications.show({ color: 'teal', title: t('placeUpdated'), message: t('placeSaved', { name: place.name }) });
    } else {
      if (replacePlaceholderId) {
        planner.replacePlaceholder(replacePlaceholderId, place);
      } else if (addPlaceDayId) {
        planner.addPlaceToDay(place, addPlaceDayId);
      } else {
        planner.addPlace(place);
      }
      if (clusterAssignment) {
        planner.setPlaceCluster(place.id, clusterAssignment.targetPlaceId, clusterAssignment.relationship, clusterAssignment.travelMinutes, clusterAssignment.travelMode);
      }
      setSelectedId(place.id);
      setActiveMapView(replacePlaceholderId ? 'all' : addPlaceDayId ?? 'unscheduled');
      notifications.show({ color: 'teal', title: t('placeAdded'), message: t('placeReady', { name: place.name }) });
    }
  }

  function handleDeletePlace() {
    if (planner.isReadOnly) return;
    if (!deleteTarget) return;
    if (deleteCluster) {
      if (clusterDeleteMode === 'replace') {
        if (!replacementAnchorId) return;
        planner.replaceLocationClusterAnchor(deleteCluster.id, replacementAnchorId);
        planner.removePlace(deleteTarget.id);
      } else if (clusterDeleteMode === 'ungroup') {
        planner.ungroupLocationCluster(deleteCluster.id);
        planner.removePlace(deleteTarget.id);
      } else {
        const clusterIds = [deleteCluster.anchorPlaceId, ...deleteCluster.members.map((member) => member.placeId)];
        clusterIds.forEach(planner.removePlace);
        if (selectedId && clusterIds.includes(selectedId)) setSelectedId(null);
      }
    } else {
      planner.removePlace(deleteTarget.id);
    }
    if (selectedId === deleteTarget.id) setSelectedId(null);
    notifications.show({ color: 'red', title: t('placeRemoved'), message: t('placeDeleted', { name: deleteTarget.name }) });
    setDeleteTarget(undefined);
  }

  const dayToDelete = planner.state.days.find((day) => day.id === dayDeleteTarget);
  const dayToDeleteIndex = dayToDelete ? planner.state.days.indexOf(dayToDelete) : -1;

  function handleDeleteDay() {
    if (planner.isReadOnly) return;
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
        places={mapPlaces}
        days={planner.state.days}
        unscheduledIds={planner.state.unscheduledIds}
        startDate={planner.state.startDate}
        selectedId={selectedId}
        visitedPlaceIds={planner.state.visitedPlaceIds ?? []}
        activeView={activeMapView}
        onSelect={setSelectedId}
        onToggleVisited={planner.isReadOnly ? undefined : planner.toggleVisited}
        onEditPlace={openEditPlace}
        onActiveViewChange={handleMapViewChange}
        onAddDay={planner.addDay}
        onRemoveDay={setDayDeleteTarget}
        currentLocation={location.isTracking ? location.location : null}
        readOnly={planner.isReadOnly}
      />
    </Suspense>
  );

  const placesPanel = (
    <Box className="library-panel">
      <PlaceLibrary
        places={planner.state.places.filter((place) => !isPlaceholder(place) && !place.assignmentOf)}
        clusters={planner.state.locationClusters}
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
        onUngroupCluster={planner.ungroupLocationCluster}
        onRenameCluster={planner.renameLocationCluster}
        readOnly={planner.isReadOnly}
      />
    </Box>
  );

  const plannerPanel = (
    <PlannerBoard
      selectedId={selectedId}
      onSelect={setSelectedId}
      onAddPlaceToDay={openAddPlaceForDay}
      onReplacePlaceholder={(placeholderId) => {
        setEditingPlace(undefined);
        setAddPlaceDayId(null);
        setReplacePlaceholderId(placeholderId);
        setPlaceModalOpened(true);
      }}
      onEditActivity={openEditActivity}
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
                <PlaceDetails place={selectedPlace} onEdit={openEditPlace} readOnly={planner.isReadOnly} />
                {!planner.isReadOnly && !selectedPlace ? (
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

  const todayPanel = (
    <TodayModePage location={location} />
  );

  return (
    <AppShell header={{ height: 72 }} padding={0}>
      <AppShell.Header>
        <AppHeader
          onAddPlace={openAddPlace}
          onOpenAiImport={() => setAiImportOpened(true)}
          onOpenSettings={() => setSettingsOpened(true)}
          onOpenShare={() => setShareOpened(true)}
          onExport={exportTrip}
          onCopyPlainText={copyItineraryText}
          onReset={resetTrip}
          onSignOut={() => void signOut()}
          location={location}
        />
      </AppShell.Header>

      <AppShell.Main>
        <Container fluid px={{ base: 'sm', md: 'lg' }} py="lg" className="app-container">
          {isDesktop ? (
            <Stack gap="md" className="desktop-workspace">
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
                      value: 'today',
                      label: (
                        <Box className="workspace-tab-label">
                          <IconSun size={15} />
                          <span>Today</span>
                        </Box>
                      ),
                    },
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
                    {
                      value: 'expenses',
                      label: (
                        <Box className="workspace-tab-label">
                          <IconReceipt size={15} />
                          <span>{t('expenses')}</span>
                        </Box>
                      ),
                    },
                  ]}
                />
              </Group>
              {desktopWorkspace === 'map' ? mapWorkspace : desktopWorkspace === 'today' ? todayPanel : desktopWorkspace === 'expenses' ? <ExpensesPage /> : plannerPanel}
            </Stack>
          ) : (
            <Stack gap="md" className="mobile-workspace">
              {mobileView === 'today' ? todayPanel : null}
              {mobileView === 'map' ? (
                <Stack gap="sm">
                  {map}
                  <Box className="mobile-place-details">
                    <PlaceDetails place={selectedPlace} onEdit={openEditPlace} readOnly={planner.isReadOnly} />
                  </Box>
                </Stack>
              ) : null}
              {mobileView === 'places' ? placesPanel : null}
              {mobileView === 'planner' ? plannerPanel : null}
              {mobileView === 'expenses' ? <ExpensesPage /> : null}
            </Stack>
          )}
        </Container>
      </AppShell.Main>
      <ShareTripModal opened={shareOpened} onClose={() => setShareOpened(false)} />
      <AiImportDrawer
        opened={aiImportOpened}
        onClose={() => setAiImportOpened(false)}
        onApply={(draft) => {
          planner.applyAiDraft(draft);
          setDesktopWorkspace('planner');
          setMobileView('planner');
          notifications.show({ color: 'teal', title: 'Import complete', message: 'Your reviewed places were added to the itinerary.' });
        }}
      />

      {!isDesktop ? (
        <Box component="nav" className="mobile-bottom-nav" aria-label={t('navigation')}>
          {mobileViews.map((item) => {
            const active = mobileView === item.value;
            const Icon =
              item.value === 'today' ? IconSun : item.value === 'map' ? IconMap : item.value === 'places' ? IconList : item.value === 'expenses' ? IconReceipt : IconCalendarEvent;
            return (
              <Button
                key={item.value}
                variant="subtle"
                color={active ? 'teal' : 'gray'}
                className="mobile-bottom-nav__item"
                data-active={active || undefined}
                onClick={() => {
                  setSettingsOpened(false);
                  setMobileView(item.value);
                }}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={21} stroke={active ? 2.5 : 1.8} />
                <span>{item.label}</span>
              </Button>
            );
          })}
        </Box>
      ) : null}

      <ActivityEditorModal
        opened={Boolean(editingActivityId)}
        activity={editingActivity}
        place={editingActivityPlace}
        onClose={() => setEditingActivityId(null)}
        onEditPlace={openEditPlace}
        onSubmit={(activityId, updates) => {
          planner.updateActivity(activityId, updates);
          notifications.show({
            color: 'teal',
            title: 'Activity updated',
            message: `${updates.title.trim()} was saved.`,
          });
        }}
      />
      <PlaceFormModal
        opened={placeModalOpened}
        place={editingPlace}
        places={planner.state.places}
        clusters={planner.state.locationClusters}
        stayBookings={planner.state.stayBookings}
        defaultCurrency={planner.state.displayCurrency ?? 'MYR'}
        onSaveStayBooking={planner.saveStayBooking}
        onAddAnotherStay={(placeId) => { setPlaceModalOpened(false); setAddStayPlaceId(placeId); }}
        onClose={() => setPlaceModalOpened(false)}
        onSubmit={handlePlaceSubmit}
      />
      <TripSettingsModal
        opened={settingsOpened}
        tripName={planner.state.tripName}
        startDate={planner.state.startDate}
        displayCurrency={planner.state.displayCurrency ?? 'MYR'}
        location={location}
        onClose={() => setSettingsOpened(false)}
        onSubmit={planner.updateTrip}
      />
      <StayBookingModal
        opened={Boolean(addStayPlaceId)}
        hotels={planner.state.places.filter((place) => place.category === 'Accommodation' && !place.assignmentOf)}
        defaultPlaceId={addStayPlaceId ?? undefined}
        defaultCurrency={planner.state.displayCurrency ?? 'MYR'}
        onClose={() => setAddStayPlaceId(null)}
        onSave={planner.saveStayBooking}
      />
      <Modal opened={Boolean(deleteTarget)} onClose={() => setDeleteTarget(undefined)} title={t('deletePlaceQuestion')} centered>
        <Stack>
          <Text size="sm">
            {t('removePlaceConfirm', { name: deleteTarget?.name ?? '' })}
          </Text>
          {deleteAssignments.length ? (
            <Stack gap={4}>
              <Text size="sm" fw={700}>{t('assignedVisits', { count: deleteAssignments.length })}</Text>
              <List size="sm" spacing={3}>
                {deleteAssignments.map((assignment, index) => (
                  <List.Item key={`${assignment.day}-${assignment.placeName}-${index}`}>
                    {assignment.day} - {assignment.placeName}
                  </List.Item>
                ))}
              </List>
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">{t('noPlannerVisits')}</Text>
          )}
          {deleteCluster ? (
            <Paper withBorder radius="md" p="sm">
              <Stack gap="xs">
                <Text size="sm" fw={700}>{deleteTarget?.name} anchors {deleteCluster.name}</Text>
                <Radio.Group value={clusterDeleteMode} onChange={(value) => setClusterDeleteMode(value as typeof clusterDeleteMode)}>
                  <Stack gap="xs">
                    <Radio value="replace" label="Choose another anchor" />
                    <Radio value="ungroup" label="Ungroup remaining places" />
                    <Radio value="all" label="Delete every place in this cluster" color="red" />
                  </Stack>
                </Radio.Group>
                {clusterDeleteMode === 'replace' ? (
                  <Select
                    label="New anchor"
                    value={replacementAnchorId}
                    data={deleteCluster.members.map((member) => ({
                      value: member.placeId,
                      label: planner.placesById.get(member.placeId)?.name ?? member.placeId,
                    }))}
                    onChange={setReplacementAnchorId}
                    allowDeselect={false}
                  />
                ) : null}
              </Stack>
            </Paper>
          ) : null}
          <Box className="modal-actions">
            <Button variant="default" onClick={() => setDeleteTarget(undefined)}>
              Cancel
            </Button>
            <Button color="red" onClick={handleDeletePlace} disabled={Boolean(deleteCluster && clusterDeleteMode === 'replace' && !replacementAnchorId)}>
              {deleteCluster && clusterDeleteMode === 'all'
                ? `Delete ${deleteCluster.members.length + 1} places`
                : deleteAssignments.length
                ? t('removePlaceAndVisits', { count: deleteAssignments.length })
                : t('deletePlace')}
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
