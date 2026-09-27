import { differenceInCalendarDays, format, parseISO } from 'date-fns';

export function daysUntil(isoDate: string): number {
  return Math.max(0, differenceInCalendarDays(parseISO(isoDate), new Date()));
}

export function formatEventDate(isoDate: string): string {
  return format(parseISO(isoDate), 'EEE, d MMM yyyy');
}

export function formatShortDate(isoDate: string): string {
  return format(parseISO(isoDate), 'd MMM');
}
