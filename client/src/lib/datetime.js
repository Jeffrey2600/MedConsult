import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';
import isToday from 'dayjs/plugin/isToday';
import isTomorrow from 'dayjs/plugin/isTomorrow';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.extend(isToday);
dayjs.extend(isTomorrow);

export { dayjs };

export const DATE_FORMAT = 'YYYY-MM-DD';

/**
 * The server stores every appointment instant in UTC; everything here renders
 * it in the viewer's own timezone, which is what makes a consultation booked
 * from another state show the right local time.
 */
export const formatTime = (value) => dayjs(value).format('h:mm A');
export const formatDate = (value) => dayjs(value).format('ddd, D MMM YYYY');
export const formatDateTime = (value) => dayjs(value).format('ddd, D MMM YYYY, h:mm A');
export const formatShortDate = (value) => dayjs(value).format('D MMM');
export const toDateKey = (value) => dayjs(value).format(DATE_FORMAT);

/** "Today", "Tomorrow", or a plain date — friendlier in appointment lists. */
export function friendlyDate(value, t) {
  const d = dayjs(value);
  if (d.isToday()) return t('datetime.today');
  if (d.isTomorrow()) return t('datetime.tomorrow');
  return formatDate(value);
}

export const fromNow = (value) => dayjs(value).fromNow();
export const isPast = (value) => dayjs(value).isBefore(dayjs());

/**
 * The consultation room opens shortly before the scheduled time and stays
 * open for a grace period afterwards, matching the server-side guard on the
 * video token endpoint.
 */
export const JOIN_WINDOW_BEFORE_MINUTES = 10;
export const JOIN_WINDOW_AFTER_MINUTES = 30;

export function canJoinCall(appointment) {
  if (!appointment || appointment.status !== 'accepted') return false;
  const now = dayjs();
  return (
    now.isAfter(dayjs(appointment.startsAt).subtract(JOIN_WINDOW_BEFORE_MINUTES, 'minute')) &&
    now.isBefore(dayjs(appointment.endsAt).add(JOIN_WINDOW_AFTER_MINUTES, 'minute'))
  );
}

/** The viewer's IANA timezone, shown next to times to avoid ambiguity. */
export const localTimezone = () => dayjs.tz.guess();
