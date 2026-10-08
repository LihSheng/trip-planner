import { useDroppable } from '@dnd-kit/core';
import { Box, Paper, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconChevronRight, IconCoffee, IconSun, IconToolsKitchen } from '@tabler/icons-react';
import type { Place, TripDay } from '../types';
import { useI18n } from '../i18n';
import { formatTripDate } from '../utils/date';
import { isPlaceholder } from '../domain/place';
import { categoryIcons } from './PlaceCard';

interface TripOverviewProps {
  days: TripDay[];
  startDate: string;
  placesById: Map<string, Place>;
  lodgingLabels: Record<string, string | undefined>;
  readOnly?: boolean;
  onOpenDay: (dayId: string) => void;
}

/** Read-only summary of every day; editing happens after opening a day. */
export function TripOverview({ days, startDate, placesById, lodgingLabels, readOnly = false, onOpenDay }: TripOverviewProps) {
  return (
    <div className="trip-overview">
      {days.map((day, index) => (
        <OverviewDayCard
          key={day.id}
          day={day}
          index={index}
          dateLabel={formatTripDate(startDate, index)}
          places={day.placeIds.flatMap((id) => {
            const place = placesById.get(id);
            return place ? [place] : [];
          })}
          lodgingLabel={lodgingLabels[day.id]}
          readOnly={readOnly}
          onOpenDay={onOpenDay}
        />
      ))}
    </div>
  );
}

interface OverviewDayCardProps {
  day: TripDay;
  index: number;
  dateLabel: string;
  places: Place[];
  lodgingLabel?: string;
  readOnly: boolean;
  onOpenDay: (dayId: string) => void;
}

function OverviewDayCard({ day, index, dateLabel, places, lodgingLabel, readOnly, onOpenDay }: OverviewDayCardProps) {
  const { t } = useI18n();
  // Separate id prefix: the rail already registers `day:<id>` and dnd-kit ids must be unique.
  const { setNodeRef, isOver } = useDroppable({ id: `overview:${day.id}`, disabled: readOnly });
  const dayName = t('day', { number: index + 1 });

  function stopName(place: Place) {
    if (!isPlaceholder(place) || place.name !== place.placeholderKind) return place.name;
    return place.placeholderKind === 'meal' ? t('lunchDinner') : place.placeholderKind === 'coffee' ? t('coffeeBreak') : place.placeholderKind === 'free-time' ? t('freeTime') : t('customStop');
  }

  return (
    <Paper ref={setNodeRef} withBorder radius="md" className="trip-overview__day" data-over={isOver || undefined}>
      <UnstyledButton className="trip-overview__header" onClick={() => onOpenDay(day.id)} aria-label={t('openDay', { day: dayName })}>
        <span className="day-rail__badge">{index + 1}</span>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text fw={700} size="sm" lineClamp={1}>{day.label.trim() || dayName}</Text>
          <Text size="xs" c="dimmed" lineClamp={1}>{lodgingLabel ? `${dateLabel} · ${lodgingLabel}` : dateLabel}</Text>
        </Box>
        <IconChevronRight size={16} color="var(--mantine-color-dimmed)" />
      </UnstyledButton>
      <Stack gap={2} className="trip-overview__stops">
        {places.length ? places.map((place) => {
          const placeholder = isPlaceholder(place);
          const Icon = placeholder
            ? place.placeholderKind === 'meal' ? IconToolsKitchen : place.placeholderKind === 'coffee' ? IconCoffee : IconSun
            : categoryIcons[place.category];
          const startTime = day.timeManagementEnabled ? day.stopSchedules?.[place.id]?.startTime : undefined;
          return (
            <div key={place.id} className="trip-overview__stop">
              {startTime ? <Text component="span" size="xs" fw={700} className="trip-overview__time">{startTime}</Text> : null}
              <Icon size={15} className={`place-card__icon place-card__icon--${placeholder ? 'placeholder' : place.category.toLowerCase()}`} />
              <Text component="span" size="sm" fw={600} lineClamp={1}>{stopName(place)}</Text>
            </div>
          );
        }) : (
          <Text size="xs" c="dimmed" ta="center" py="sm">{t('noStopsYet')}</Text>
        )}
      </Stack>
    </Paper>
  );
}
