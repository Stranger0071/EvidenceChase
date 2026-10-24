import { escapeHtml } from '../lib/http';
import type { EmailMessage } from '../ports/mailer';

/**
 * Transactional emails. Each one has a plain-text and an HTML version. Every value that a person
 * typed (names, titles, comments) is escaped, so nobody can inject markup or links into an email
 * that arrives from us.
 */

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "5 Nov 2026" from a YYYY-MM-DD due date. */
function formatDueDate(isoDate: string): string {
  return dateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

function layout(bodyHtml: string): string {
  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#1c1c1a;max-width:560px">',
    bodyHtml,
    '<p style="color:#6b6b66;font-size:13px;margin-top:24px">Sent by EvidenceChase on behalf of your compliance team. No account needed: each link opens your request directly. Don\'t forward these links; they let anyone with them upload evidence.</p>',
    '</div>',
  ].join('\n');
}

function button(url: string, label: string): string {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;background:#2742d9;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none">${escapeHtml(label)}</a>`;
}

export interface RequestLink {
  controlRef: string;
  title: string;
  dueDate: string;
  url: string;
}

/** One email per owner listing all of their open requests, each with its own magic link. */
export function evidenceRequestedEmail(input: {
  to: string;
  ownerName: string | null;
  auditName: string;
  links: RequestLink[];
}): EmailMessage {
  const greeting = input.ownerName ?? 'there';
  const count = input.links.length;
  const plural = count === 1 ? 'request' : 'requests';

  const text = [
    `Hi ${greeting},`,
    '',
    `Your compliance team needs evidence from you for "${input.auditName}" (${count} ${plural}):`,
    '',
    ...input.links.flatMap((link) => [
      `• ${link.controlRef}: ${link.title} (due ${formatDueDate(link.dueDate)})`,
      `  ${link.url}`,
      '',
    ]),
    'Open a link to see exactly what is needed and upload your files. No account needed.',
  ].join('\n');

  const items = input.links
    .map(
      (link) =>
        `<li style="margin-bottom:12px"><strong>${escapeHtml(link.controlRef)}</strong>: ${escapeHtml(link.title)}<br/><span style="color:#6b6b66">Due ${formatDueDate(link.dueDate)}</span><br/>${button(link.url, 'Upload evidence')}</li>`,
    )
    .join('\n');

  const html = layout(
    [
      `<p>Hi ${escapeHtml(greeting)},</p>`,
      `<p>Your compliance team needs evidence from you for <strong>${escapeHtml(input.auditName)}</strong> (${count} ${plural}):</p>`,
      `<ul style="padding-left:18px">${items}</ul>`,
      '<p>Open a link to see exactly what is needed and upload your files. No account needed.</p>',
    ].join('\n'),
  );

  return { to: input.to, subject: `Evidence needed: ${input.auditName}`, text, html };
}

/** Sent when the manager sends evidence back, or re-opens accepted evidence. */
export function changesRequestedEmail(input: {
  to: string;
  ownerName: string | null;
  controlRef: string;
  title: string;
  comment: string;
  url: string;
}): EmailMessage {
  const greeting = input.ownerName ?? 'there';
  const subject = `Changes needed: ${input.controlRef} ${input.title}`;

  const text = [
    `Hi ${greeting},`,
    '',
    `Your evidence for "${input.controlRef}: ${input.title}" needs changes:`,
    '',
    `"${input.comment}"`,
    '',
    `Upload an updated version here: ${input.url}`,
  ].join('\n');

  const html = layout(
    [
      `<p>Hi ${escapeHtml(greeting)},</p>`,
      `<p>Your evidence for <strong>${escapeHtml(input.controlRef)}: ${escapeHtml(input.title)}</strong> needs changes:</p>`,
      `<blockquote style="border-left:3px solid #e4e4df;margin:0;padding:4px 12px;color:#1c1c1a">${escapeHtml(input.comment)}</blockquote>`,
      `<p>${button(input.url, 'Upload an updated version')}</p>`,
    ].join('\n'),
  );

  return { to: input.to, subject, text, html };
}

/** Sent to the owner when one of their files fails the malware scan. */
export function scanFailedEmail(input: {
  to: string;
  ownerName: string | null;
  controlRef: string;
  title: string;
  fileName: string;
  reason: string;
  url: string;
}): EmailMessage {
  const greeting = input.ownerName ?? 'there';

  const text = [
    `Hi ${greeting},`,
    '',
    `We couldn't accept "${input.fileName}" for "${input.controlRef}: ${input.title}": ${input.reason}`,
    '',
    'The file has been deleted. Please check it on your device and upload a clean copy here:',
    input.url,
  ].join('\n');

  const html = layout(
    [
      `<p>Hi ${escapeHtml(greeting)},</p>`,
      `<p>We couldn't accept <strong>${escapeHtml(input.fileName)}</strong> for <strong>${escapeHtml(input.controlRef)}: ${escapeHtml(input.title)}</strong>: ${escapeHtml(input.reason)}</p>`,
      '<p>The file has been deleted. Please check it on your device and upload a clean copy.</p>',
      `<p>${button(input.url, 'Upload again')}</p>`,
    ].join('\n'),
  );

  return {
    to: input.to,
    subject: `File not accepted: ${input.controlRef} ${input.title}`,
    text,
    html,
  };
}

/** Tells the manager that evidence is waiting for review. */
export function evidenceSubmittedEmail(input: {
  to: string;
  auditName: string;
  controlRef: string;
  title: string;
  ownerEmail: string;
  fileCount: number;
  url: string;
}): EmailMessage {
  const files = `${input.fileCount} file${input.fileCount === 1 ? '' : 's'}`;

  const text = [
    `${input.ownerEmail} submitted ${files} for "${input.controlRef}: ${input.title}" in "${input.auditName}".`,
    '',
    `Review it here: ${input.url}`,
  ].join('\n');

  const html = layout(
    [
      `<p><strong>${escapeHtml(input.ownerEmail)}</strong> submitted ${files} for <strong>${escapeHtml(input.controlRef)}: ${escapeHtml(input.title)}</strong> in <strong>${escapeHtml(input.auditName)}</strong>.</p>`,
      `<p>${button(input.url, 'Review evidence')}</p>`,
    ].join('\n'),
  );

  return {
    to: input.to,
    subject: `Evidence to review: ${input.controlRef} ${input.title}`,
    text,
    html,
  };
}

export interface ReminderItem extends RequestLink {
  auditName: string;
  /** "Due in 3 days", "Overdue by 6 days" … */
  dueLabel: string;
  overdue: boolean;
  changesRequested: boolean;
}

/**
 * The daily reminder digest (PRD §8.6): one email per owner, covering every request that's due a
 * reminder today, overdue ones first.
 */
export function reminderDigestEmail(input: {
  to: string;
  ownerName: string | null;
  items: ReminderItem[];
}): EmailMessage {
  const greeting = input.ownerName ?? 'there';
  const items = [...input.items].sort((a, b) => Number(b.overdue) - Number(a.overdue));
  const overdueCount = items.filter((item) => item.overdue).length;
  const subject =
    overdueCount > 0
      ? `Overdue: evidence for ${overdueCount} request${overdueCount === 1 ? '' : 's'}`
      : `Reminder: evidence due soon (${items.length} request${items.length === 1 ? '' : 's'})`;

  const text = [
    `Hi ${greeting},`,
    '',
    'A reminder that your compliance team is still waiting for this evidence:',
    '',
    ...items.flatMap((item) => [
      `• ${item.controlRef}: ${item.title} (${item.auditName}): ${item.dueLabel}${item.changesRequested ? ', changes requested' : ''}`,
      `  ${item.url}`,
      '',
    ]),
    'Already sent it? You can ignore this. Reminders stop as soon as evidence is submitted.',
  ].join('\n');

  const rows = items
    .map(
      (item) =>
        `<li style="margin-bottom:12px"><strong>${escapeHtml(item.controlRef)}</strong>: ${escapeHtml(item.title)} <span style="color:#6b6b66">(${escapeHtml(item.auditName)})</span><br/><span style="color:${item.overdue ? '#c62828' : '#6b6b66'}">${escapeHtml(item.dueLabel)} · ${formatDueDate(item.dueDate)}${item.changesRequested ? ' · changes requested' : ''}</span><br/>${button(item.url, 'Upload evidence')}</li>`,
    )
    .join('\n');

  const html = layout(
    [
      `<p>Hi ${escapeHtml(greeting)},</p>`,
      '<p>A reminder that your compliance team is still waiting for this evidence:</p>',
      `<ul style="padding-left:18px">${rows}</ul>`,
      '<p style="color:#6b6b66">Already sent it? You can ignore this. Reminders stop as soon as evidence is submitted.</p>',
    ].join('\n'),
  );

  return { to: input.to, subject, text, html };
}
