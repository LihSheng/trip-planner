import type { PointerEventHandler } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ActionIcon, Box, Group, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconHistory, IconLayoutGrid, IconPlus } from '@tabler/icons-react';
import type { TripDay } from '../types';
import { useI18n } from '../i18n';
import { formatTripDate } from '../utils/date';

export interface DaySummary {
  stopCount: number;
  visitedCount: number;
  openTaskCount: number;
}

type Translate = ReturnType<typeof useI18n>['t'];

// TODO(human): decide what each day row in the rail says under its title.
function daySubtitle(t: Translate, dateLabel: string, summary: DaySummary): string {
  return dateLabel;
}

interface DayRailProps {
  days: TripDay[];
  startDate: string;
  summaries: Record<string, DaySummary>;
  selectedDayId: string | null;
  readOnly?: boolean;
  onSelect: (dayId: string | null) => void;
  onAddDay: () => void;
  onOpenActivity: () => void;
}

export function DayRail({ days, startDate, summaries, selectedDayId, readOnly = false, onSelect, onAddDay, onOpenActivity }: DayRailProps) {
  const { t } = useI18n();
  const totalStops = days.reduce((total, day) => total + (summaries[day.id]?.stopCount ?? 0), 0);

  return (
    <Box component="nav" aria-label={t('tripDays')} className="day-rail">
      <Group justify="space-between" wrap="nowrap" className="day-rail__header">
        <Text fw={800} size="lg">{t('itinerary')}</Text>
        {!readOnly ? (
          <Tooltip label={t('activity')}>
            <ActionIcon variant="subtle" color="gray" aria-label={t('activity')} onClick={onOpenActivity}>
              <IconHistory size={17} />
            </ActionIcon>
          </Tooltip>
        ) : null}
      </Group>
      <div className="day-rail__list">
        <UnstyledButton
          className="day-rail__item day-rail__item--overview"
          data-active={selectedDayId === null || undefined}
          aria-current={selectedDayId === null ? 'page' : undefined}
          onClick={() => onSelect(null)}
        >
          <span className="day-rail__badge"><IconLayoutGrid size={17} /></span>
          <span className="day-rail__text">
            <Text component="span" fw={700} size="sm" className="day-rail__title">{t('wholeTrip')}</Text>
            <Text component="span" size="xs" c="dimmed" className="day-rail__subtitle">{t('wholeTripSummary', { days: days.length, stops: totalStops })}</Text>
          </span>
        </UnstyledButton>
        <div className="day-rail__divider" />
        {days.map((day, index) => (
          <DayRailItem
            key={day.id}
            day={day}
            index={index}
            dateLabel={formatTripDate(startDate, index)}
            summary={summaries[day.id] ?? { stopCount: 0, visitedCount: 0, openTaskCount: 0 }}
            active={selectedDayId === day.id}
            readOnly={readOnly}
            onSelect={onSelect}
          />
        ))}
        {!readOnly ? (
          <UnstyledButton className="day-rail__add" onClick={onAddDay}>
            <IconPlus size={15} />
            <span>{t('addDay')}</span>
          </UnstyledButton>
        ) : null}
      </div>
    </Box>
  );
}

interface DayRailItemProps {
  day: TripDay;
  index: number;
  dateLabel: string;
  summary: DaySummary;
  active: boolean;
  readOnly: boolean;
  onSelect: (dayId: string) => void;
}

function DayRailItem({ day, index, dateLabel, summary, active, readOnly, onSelect }: DayRailItemProps) {
  const { t } = useI18n();
  const isDesktop = useMediaQuery('(min-width: 48em)');
  // The rail owns the `day:` sortable ids, so dropping a place here moves it to this day
  // and dragging the row reorders days. Phones scroll the rail sideways, so only desktop can drag it.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: `day:${day.id}`,
    data: { type: 'day', dayId: day.id },
    disabled: { draggable: readOnly || !isDesktop, droppable: readOnly },
  });
  const dayName = t('day', { number: index + 1 });

  return (
    <UnstyledButton
      ref={setNodeRef}
      className="day-rail__item"
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-active={active || undefined}
      data-over={isOver || undefined}
      data-dragging={isDragging || undefined}
      aria-current={active ? 'page' : undefined}
      aria-roledescription={attributes['aria-roledescription']}
      // Pointer only: Enter and Space must keep selecting the day instead of starting a keyboard drag.
      onPointerDown={listeners?.onPointerDown as PointerEventHandler<HTMLButtonElement> | undefined}
      onClick={() => onSelect(day.id)}
    >
      <span className="day-rail__badge">{index + 1}</span>
      <span className="day-rail__text">
        <Text component="span" fw={700} size="sm" className="day-rail__title">{day.label.trim() || dayName}</Text>
        <Text component="span" size="xs" c="dimmed" className="day-rail__subtitle">{daySubtitle(t, dateLabel, summary)}</Text>
        <Text component="span" size="xs" fw={700} className="day-rail__short-date">{dateLabel}</Text>
      </span>
      {summary.openTaskCount > 0 ? (
        <span className="day-rail__tasks" aria-label={t('openTasks', { count: summary.openTaskCount })}>{summary.openTaskCount}</span>
      ) : null}
    </UnstyledButton>
  );
}
