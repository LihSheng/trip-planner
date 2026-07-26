import type { Place } from '../types';

export type StayAssignmentStatus = 'valid' | 'missing-dates' | 'before-check-in' | 'checked-out';

export function isAccommodation(place: Place) {
  return place.category === 'Accommodation';
}

export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function stayAssignmentStatus(place: Place, date: string): StayAssignmentStatus {
  if (!place.stay?.checkInDate || !place.stay?.checkOutDate) return 'missing-dates';
  if (date < place.stay.checkInDate) return 'before-check-in';
  if (date > place.stay.checkOutDate) return 'checked-out';
  return 'valid';
}

export function isStayExpired(place: Place, today = localDateString()) {
  return isAccommodation(place) && Boolean(place.stay?.checkOutDate && place.stay.checkOutDate < today);
}
