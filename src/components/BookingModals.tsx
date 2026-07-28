import { useEffect } from 'react';
import { Button, Group, Modal, NativeSelect, NumberInput, Select, SimpleGrid, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import type { CurrencyCode, ExpenseCategory, FlightBooking, FlightLeg, Place, StayBooking, TripDay, TripExpense } from '../types';
import { useI18n } from '../i18n';

export const currencies: CurrencyCode[] = ['MYR', 'TWD', 'SGD', 'USD', 'EUR', 'JPY', 'CNY', 'AUD', 'GBP'];

export function ExpenseModal({ opened, expense, days, places, defaultCurrency, onClose, onSave }: {
  opened: boolean; expense?: TripExpense; days: TripDay[]; places: Place[]; defaultCurrency: CurrencyCode;
  onClose: () => void; onSave: (expense: TripExpense) => void;
}) {
  const { locale } = useI18n();
  const zh = locale === 'zh-TW';
  const form = useForm({
    initialValues: { name: '', amount: 0, currency: defaultCurrency, category: 'other' as ExpenseCategory, dayId: '', placeId: '', note: '', purchaseDate: '' },
    validate: { name: (value) => value.trim() ? null : zh ? '請輸入名稱' : 'Enter a name', amount: (value) => Number(value) > 0 ? null : zh ? '金額必須大於零' : 'Amount must be greater than zero' },
  });
  useEffect(() => {
    if (!opened) return;
    form.setValues(expense ? { name: expense.name ?? '', amount: expense.amount, currency: expense.currency, category: expense.category, dayId: expense.dayId ?? '', placeId: expense.placeId ?? '', note: expense.note ?? '', purchaseDate: expense.purchaseDate ?? '' } : { name: '', amount: 0, currency: defaultCurrency, category: 'other', dayId: '', placeId: '', note: '', purchaseDate: '' });
  }, [opened, expense?.id, defaultCurrency]);
  return <Modal opened={opened} onClose={onClose} title={expense ? (zh ? '編輯支出' : 'Edit expense') : (zh ? '新增支出' : 'Add expense')} centered>
    <form onSubmit={form.onSubmit((value) => { onSave({ id: expense?.id ?? `expense-${crypto.randomUUID()}`, name: value.name.trim(), amount: Number(value.amount), currency: value.currency as CurrencyCode, category: value.category, dayId: value.dayId || undefined, placeId: value.placeId || undefined, note: value.note.trim() || undefined, purchaseDate: value.purchaseDate || undefined, createdAt: expense?.createdAt ?? new Date().toISOString() }); onClose(); })}>
      <Stack>
        <TextInput label={zh ? '名稱' : 'Name'} required {...form.getInputProps('name')} />
        <SimpleGrid cols={2}><NumberInput label={zh ? '金額' : 'Amount'} min={0} decimalScale={2} required {...form.getInputProps('amount')} /><NativeSelect label={zh ? '貨幣' : 'Currency'} data={currencies} {...form.getInputProps('currency')} /></SimpleGrid>
        <NativeSelect label={zh ? '類別' : 'Category'} data={[
          { value: 'food', label: zh ? '飲食' : 'Food' }, { value: 'transport', label: zh ? '交通' : 'Transport' }, { value: 'ticket', label: zh ? '門票' : 'Ticket' },
          { value: 'shopping', label: zh ? '購物' : 'Shopping' }, { value: 'accommodation', label: zh ? '住宿' : 'Accommodation' }, { value: 'other', label: zh ? '其他' : 'Other' },
        ]} {...form.getInputProps('category')} />
        <Select clearable label={zh ? '行程日期（選填）' : 'Trip day (optional)'} data={days.map((day, index) => ({ value: day.id, label: `${zh ? '第' : 'Day '}${index + 1}${zh ? '天' : ''} · ${day.label}` }))} {...form.getInputProps('dayId')} />
        <Select searchable clearable label={zh ? '連結景點（選填）' : 'Linked place (optional)'} data={places.filter((place) => !place.assignmentOf).map((place) => ({ value: place.id, label: place.name }))} {...form.getInputProps('placeId')} />
        <TextInput type="date" label={zh ? '購買日期（選填）' : 'Purchase date (optional)'} {...form.getInputProps('purchaseDate')} />
        <Textarea label={zh ? '備註（選填）' : 'Note (optional)'} {...form.getInputProps('note')} />
        <Group justify="flex-end"><Button variant="default" onClick={onClose}>{zh ? '取消' : 'Cancel'}</Button><Button type="submit">{zh ? '儲存' : 'Save'}</Button></Group>
      </Stack>
    </form>
  </Modal>;
}

const emptyLeg = (date = ''): FlightLeg => ({ airline: '', flightNumber: '', departureAirport: '', departureDate: date, departureTime: '', arrivalAirport: '', arrivalDate: date, arrivalTime: '' });

function LegFields({ prefix, label, form, zh }: { prefix: 'outbound' | 'return'; label: string; form: ReturnType<typeof useForm<any>>; zh: boolean }) {
  return <Stack gap="xs"><Text fw={800}>{label}</Text>
    <SimpleGrid cols={2}><TextInput label={zh ? '航空公司' : 'Airline'} required {...form.getInputProps(`${prefix}.airline`)} /><TextInput label={zh ? '航班編號' : 'Flight number'} {...form.getInputProps(`${prefix}.flightNumber`)} /></SimpleGrid>
    <SimpleGrid cols={2}><TextInput label={zh ? '出發機場' : 'Departure airport'} required {...form.getInputProps(`${prefix}.departureAirport`)} /><TextInput label={zh ? '抵達機場' : 'Arrival airport'} required {...form.getInputProps(`${prefix}.arrivalAirport`)} /></SimpleGrid>
    <SimpleGrid cols={2}><TextInput type="date" label={zh ? '出發日期' : 'Departure date'} required {...form.getInputProps(`${prefix}.departureDate`)} /><TextInput type="time" label={zh ? '出發時間' : 'Departure time'} required {...form.getInputProps(`${prefix}.departureTime`)} /></SimpleGrid>
    <SimpleGrid cols={2}><TextInput type="date" label={zh ? '抵達日期' : 'Arrival date'} required {...form.getInputProps(`${prefix}.arrivalDate`)} /><TextInput type="time" label={zh ? '抵達時間' : 'Arrival time'} required {...form.getInputProps(`${prefix}.arrivalTime`)} /></SimpleGrid>
  </Stack>;
}

export function FlightBookingModal({ opened, booking, defaultDate = '', defaultCurrency, onClose, onSave, onDelete }: {
  opened: boolean; booking?: FlightBooking; defaultDate?: string; defaultCurrency: CurrencyCode; onClose: () => void; onSave: (booking: FlightBooking) => void; onDelete?: (id: string) => void;
}) {
  const { locale } = useI18n(); const zh = locale === 'zh-TW';
  const form = useForm({ initialValues: { tripType: 'one-way' as FlightBooking['tripType'], outbound: emptyLeg(defaultDate), return: emptyLeg(defaultDate), amount: '' as number | '', currency: defaultCurrency } });
  useEffect(() => {
    if (!opened) return;
    form.setValues(booking ? { tripType: booking.tripType, outbound: booking.outbound, return: booking.return ?? emptyLeg(booking.outbound.arrivalDate), amount: booking.totalCost?.amount ?? '', currency: booking.totalCost?.currency ?? defaultCurrency } : { tripType: 'one-way', outbound: emptyLeg(defaultDate), return: emptyLeg(defaultDate), amount: '', currency: defaultCurrency });
  }, [opened, booking?.id, defaultDate, defaultCurrency]);
  const required = (leg: FlightLeg) => leg.airline && leg.departureAirport && leg.arrivalAirport && leg.departureDate && leg.departureTime && leg.arrivalDate && leg.arrivalTime;
  return <Modal opened={opened} onClose={onClose} title={booking ? (zh ? '編輯航班' : 'Edit flight') : (zh ? '新增航班' : 'Add flight')} size="lg" centered>
    <form onSubmit={form.onSubmit((value) => {
      if (!required(value.outbound) || (value.tripType === 'round-trip' && !required(value.return))) return;
      onSave({ id: booking?.id ?? `flight-${crypto.randomUUID()}`, tripType: value.tripType, outbound: value.outbound, return: value.tripType === 'round-trip' ? value.return : undefined, totalCost: Number(value.amount) > 0 ? { amount: Number(value.amount), currency: value.currency as CurrencyCode } : undefined }); onClose();
    })}><Stack>
      <NativeSelect label={zh ? '行程類型' : 'Trip type'} data={[{ value: 'one-way', label: zh ? '單程' : 'One-way' }, { value: 'round-trip', label: zh ? '來回' : 'Round-trip' }]} {...form.getInputProps('tripType')} />
      <LegFields prefix="outbound" label={zh ? '去程' : 'Outbound'} form={form} zh={zh} />
      {form.values.tripType === 'round-trip' ? <LegFields prefix="return" label={zh ? '回程' : 'Return'} form={form} zh={zh} /> : null}
      <Text fw={800}>{zh ? '整筆訂單費用' : 'Total booking cost'}</Text>
      <SimpleGrid cols={2}><NumberInput label={zh ? '金額（選填）' : 'Amount (optional)'} min={0} decimalScale={2} {...form.getInputProps('amount')} /><NativeSelect label={zh ? '貨幣' : 'Currency'} data={currencies} {...form.getInputProps('currency')} /></SimpleGrid>
      <Group justify="space-between">{booking && onDelete ? <Button color="red" variant="light" onClick={() => { onDelete(booking.id); onClose(); }}>{zh ? '刪除航班訂單' : 'Delete flight booking'}</Button> : <span />}<Group><Button variant="default" onClick={onClose}>{zh ? '取消' : 'Cancel'}</Button><Button type="submit">{zh ? '儲存' : 'Save'}</Button></Group></Group>
    </Stack></form>
  </Modal>;
}

export function StayBookingModal({ opened, booking, hotels, defaultPlaceId, defaultCurrency, onClose, onSave, onDelete }: {
  opened: boolean; booking?: StayBooking; hotels: Place[]; defaultPlaceId?: string; defaultCurrency: CurrencyCode; onClose: () => void; onSave: (booking: StayBooking) => void; onDelete?: (id: string) => void;
}) {
  const { locale } = useI18n(); const zh = locale === 'zh-TW';
  const form = useForm({ initialValues: { placeId: '', checkInDate: '', checkOutDate: '', amount: '' as number | '', currency: defaultCurrency } });
  useEffect(() => { if (opened) form.setValues(booking ? { placeId: booking.placeId, checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate, amount: booking.cost?.amount ?? '', currency: booking.cost?.currency ?? defaultCurrency } : { placeId: defaultPlaceId ?? hotels[0]?.id ?? '', checkInDate: '', checkOutDate: '', amount: '', currency: defaultCurrency }); }, [opened, booking?.id, defaultPlaceId, defaultCurrency, hotels.length]);
  return <Modal opened={opened} onClose={onClose} title={booking ? (zh ? '編輯住宿' : 'Edit stay') : (zh ? '新增住宿' : 'Add stay')} centered>
    <form onSubmit={form.onSubmit((value) => { if (!value.placeId || !value.checkInDate || !value.checkOutDate || value.checkOutDate < value.checkInDate) return; onSave({ id: booking?.id ?? `stay-${crypto.randomUUID()}`, placeId: value.placeId, checkInDate: value.checkInDate, checkOutDate: value.checkOutDate, cost: Number(value.amount) > 0 ? { amount: Number(value.amount), currency: value.currency as CurrencyCode } : undefined }); onClose(); })}><Stack>
      <Select searchable label={zh ? '住宿地點' : 'Accommodation'} required data={hotels.map((hotel) => ({ value: hotel.id, label: hotel.name }))} {...form.getInputProps('placeId')} />
      <SimpleGrid cols={2}><TextInput type="date" label={zh ? '入住日期' : 'Check-in date'} required {...form.getInputProps('checkInDate')} /><TextInput type="date" label={zh ? '退房日期' : 'Check-out date'} required {...form.getInputProps('checkOutDate')} /></SimpleGrid>
      <SimpleGrid cols={2}><NumberInput label={zh ? '整段住宿費用（選填）' : 'Total stay cost (optional)'} min={0} decimalScale={2} {...form.getInputProps('amount')} /><NativeSelect label={zh ? '貨幣' : 'Currency'} data={currencies} {...form.getInputProps('currency')} /></SimpleGrid>
      <Group justify="space-between">{booking && onDelete ? <Button color="red" variant="light" onClick={() => { onDelete(booking.id); onClose(); }}>{zh ? '刪除住宿訂單' : 'Delete stay booking'}</Button> : <span />}<Group><Button variant="default" onClick={onClose}>{zh ? '取消' : 'Cancel'}</Button><Button type="submit">{zh ? '儲存' : 'Save'}</Button></Group></Group>
    </Stack></form>
  </Modal>;
}
