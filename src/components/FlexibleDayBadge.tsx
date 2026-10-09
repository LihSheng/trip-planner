import { Badge, Tooltip } from '@mantine/core';
import type { Place } from '../types';
import { useI18n } from '../i18n';

export function FlexibleDayBadge({ places }: { places: Place[] }) {
  const { t } = useI18n();
  if (!places.length) return null;
  const names = places.map((place) => place.name).join(', ');
  return (
    <Tooltip label={names} withArrow multiline maw={240}>
      <Badge variant="light" color="violet" tt="none" aria-label={t('flexibleSpotsForDay', { names })}>
        ✦ {places.length}
      </Badge>
    </Tooltip>
  );
}
