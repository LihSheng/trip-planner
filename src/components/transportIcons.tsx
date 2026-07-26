import type { ReactElement } from 'react';
import { IconBike, IconBus, IconCar, IconDots, IconWalk } from '@tabler/icons-react';
import type { TravelMode } from '../types';

/** Map a travel mode to its Tabler icon. */
export function transportIcon(mode: TravelMode): ReactElement {
  if (mode === 'walk') return <IconWalk size={16} />;
  if (mode === 'bike') return <IconBike size={16} />;
  if (mode === 'car') return <IconCar size={16} />;
  if (mode === 'taxi') return <IconCar size={16} />;
  if (mode === 'other') return <IconDots size={16} />;
  return <IconBus size={16} />;
}
