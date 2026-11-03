import type { SummaryTemplate } from '../../core/models/summary-template.model';
import { tr } from '../../../../i18n/tr';

const SECONDS_PER_MINUTE = 60;

/** Formats a non-negative duration in seconds as zero-padded `mm:ss`. */
export const formatMmSs = (totalSeconds: number): string => {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / SECONDS_PER_MINUTE);
  const seconds = clamped % SECONDS_PER_MINUTE;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

/** Formats a non-negative duration in seconds as a short whole-minute label, e.g. `32m`. */
export const formatMinutesShort = (durationSec: number): string => {
  const minutes = Math.max(0, Math.round(durationSec / SECONDS_PER_MINUTE));
  return tr('time.minutesShort', { value: minutes });
};

/** Formats a non-negative duration in seconds as a long whole-minute label, e.g. `32 min`. */
export const formatMinutesLong = (durationSec: number): string => {
  const minutes = Math.max(0, Math.round(durationSec / SECONDS_PER_MINUTE));
  return tr('time.minutesLong', { value: minutes });
};

const isSameCalendarDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const formatHhMm = (date: Date): string =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/** Formats a date as `27 Aug` (`27 août` in French) — month names come from the catalogue, never `toLocaleDateString`, so the output is deterministic. */
export const formatShortDate = (date: Date): string =>
  tr('dates.short', { day: date.getDate(), month: tr(`dates.months.${date.getMonth()}`) });

/**
 * Relative day label for the sidebar's secondary line: `HH:MM` when `date` falls
 * on `now`'s calendar day, `Yest.` for the previous calendar day, else a short date.
 */
export const formatRelativeDay = (date: Date, now: Date): string => {
  if (isSameCalendarDay(date, now)) {
    return formatHhMm(date);
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameCalendarDay(date, yesterday)) {
    return tr('dates.yesterdayShort');
  }
  return formatShortDate(date);
};

/** Sidebar row secondary line, e.g. `14:02 · 32m` or `Yest. · 24m`. */
export const formatMeetingListMeta = (createdAt: Date, durationSec: number, now: Date = new Date()): string =>
  `${formatRelativeDay(createdAt, now)} · ${formatMinutesShort(durationSec)}`;

/** Detail-pane heading date, e.g. `27 Aug, 14:02`. */
export const formatMeetingHeadingDate = (createdAt: Date): string => `${formatShortDate(createdAt)}, ${formatHhMm(createdAt)}`;

/** Fallback label shown in place of a blank meeting title (e.g. a freshly started, not-yet-renamed recording). */
export const untitledMeetingLabel = (): string => tr('meetings.untitled');

/** Renders `title` as-is, or {@link untitledMeetingLabel} when it is empty/whitespace-only. */
export const formatMeetingTitle = (title: string): string => (title.trim().length > 0 ? title : untitledMeetingLabel());

/** Title-cases a kebab-case slug, e.g. `meeting-notes` -> `Meeting Notes`. */
const titleCaseFromSlug = (slug: string): string =>
  slug
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

/**
 * The English text shipped in `templates/*.json` for the built-in templates.
 * A template whose text is still this stock text is shown in the interface
 * language (`templates.<name>.label|description`); a template the user edited
 * or wrote keeps its own text, since only they can translate it.
 */
const STOCK_TEMPLATE_TEXT: Readonly<Record<string, Readonly<Record<'label' | 'description', string>>>> = {
  'key-points': {
    label: 'Key Points',
    description: 'Extract the key points discussed in the meeting as a concise bullet list.',
  },
  'action-items': {
    label: 'Action Items',
    description: 'Extract concrete action items with an owner and due date where mentioned.',
  },
  'meeting-notes': {
    label: 'Notes',
    description: 'Produce a full set of meeting notes: an overall summary, a discussion narrative, and a list of decisions.',
  },
  'full-report': {
    label: 'Full Report',
    description: 'Produce the whole report in one pass: an overall summary, the key points, the decisions and the action items.',
  },
  decisions: {
    label: 'Decisions',
    description: 'Extract the decisions that were made in the meeting along with the reasoning behind each one.',
  },
};

const localisedTemplateText = (template: SummaryTemplate, field: 'label' | 'description'): string | undefined => {
  const own = template[field]?.trim();
  const stock = Object.hasOwn(STOCK_TEMPLATE_TEXT, template.name) ? STOCK_TEMPLATE_TEXT[template.name] : undefined;
  return stock !== undefined && own === stock[field] ? tr(`templates.${template.name}.${field}`) : own;
};

/** Tooltip text of a template tab, in the interface language for the built-in templates. */
export const formatTemplateDescription = (template: SummaryTemplate): string =>
  localisedTemplateText(template, 'description') ?? '';

/** Fallback emoji for a summary template tab when the template specifies none. */
const GENERIC_TEMPLATE_EMOJI = '🗒️';

/** Static label for the always-present transcript tab. */
export const transcriptTabLabel = (): string => `📄 ${tr('meetings.transcript')}`;

const composeTabLabel = (emoji: string, text: string): string => `${emoji} ${text}`;

/**
 * Compact label for a summary template tab. Never uses `description` — that
 * field is a full sentence meant for a tooltip, not the tab strip. Order of
 * preference:
 * 1. `emoji` + `label` when both are present.
 * 2. `emoji` + title-cased `name` when only `emoji` is present.
 * 3. {@link GENERIC_TEMPLATE_EMOJI} + `label` when only `label` is present.
 * 4. {@link GENERIC_TEMPLATE_EMOJI} + title-cased `name` when neither is present.
 */
export const formatTemplateLabel = (template: SummaryTemplate): string => {
  const emoji = template.emoji?.trim();
  const label = localisedTemplateText(template, 'label');
  const nameLabel = titleCaseFromSlug(template.name);

  if (emoji && label) {
    return composeTabLabel(emoji, label);
  }
  if (emoji) {
    return composeTabLabel(emoji, nameLabel);
  }
  if (label) {
    return composeTabLabel(GENERIC_TEMPLATE_EMOJI, label);
  }
  return composeTabLabel(GENERIC_TEMPLATE_EMOJI, nameLabel);
};
