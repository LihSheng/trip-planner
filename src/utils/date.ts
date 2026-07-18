const formatter = new Intl.DateTimeFormat('en-MY', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

export function addDays(dateString: string, offset: number): Date {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return date;
}

export function formatTripDate(dateString: string, offset: number): string {
  return formatter.format(addDays(dateString, offset));
}
