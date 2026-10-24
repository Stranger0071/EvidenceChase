import { describe, expect, it } from 'vitest';
import { changesRequestedEmail, evidenceRequestedEmail, reminderDigestEmail } from './templates';

describe('email templates', () => {
  it('lists every request with its own link', () => {
    const email = evidenceRequestedEmail({
      to: 'rahul@example.com',
      ownerName: 'Rahul',
      auditName: 'SOC 2',
      links: [
        { controlRef: 'CC6.1', title: 'MFA', dueDate: '2026-11-05', url: 'https://app/e/one' },
        {
          controlRef: 'CC6.2',
          title: 'Access review',
          dueDate: '2026-11-10',
          url: 'https://app/e/two',
        },
      ],
    });

    expect(email.subject).toBe('Evidence needed: SOC 2');
    expect(email.text).toContain('CC6.1: MFA (due 5 Nov 2026)');
    expect(email.text).toContain('https://app/e/two');
    expect(email.html.match(/href="https:\/\/app\/e\//g)).toHaveLength(2);
  });

  it('escapes text that people typed', () => {
    const email = changesRequestedEmail({
      to: 'rahul@example.com',
      ownerName: '<b>Rahul</b>',
      controlRef: 'CC6.1',
      title: 'MFA',
      comment: '<a href="https://evil.example">click</a>',
      url: 'https://app/e/token',
    });

    expect(email.html).not.toContain('<a href="https://evil.example">');
    expect(email.html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;');
    expect(email.html).toContain('&lt;b&gt;Rahul&lt;/b&gt;');
  });
});

describe('reminder digest', () => {
  const item = (controlRef: string, overdue: boolean) => ({
    controlRef,
    title: 'Evidence',
    auditName: 'SOC 2',
    dueDate: '2026-10-20',
    dueLabel: overdue ? 'Overdue by 3 days' : 'Due in 3 days',
    overdue,
    changesRequested: false,
    url: `https://app/e/${controlRef}`,
  });

  it('lists overdue requests first and says so in the subject', () => {
    const email = reminderDigestEmail({
      to: 'rahul@example.com',
      ownerName: 'Rahul',
      items: [item('CC1', false), item('CC2', true)],
    });

    expect(email.subject).toBe('Overdue: evidence for 1 request');
    expect(email.text.indexOf('CC2')).toBeLessThan(email.text.indexOf('CC1'));
  });

  it('uses a gentler subject when nothing is overdue', () => {
    const email = reminderDigestEmail({
      to: 'a@example.com',
      ownerName: null,
      items: [item('CC1', false)],
    });
    expect(email.subject).toBe('Reminder: evidence due soon (1 request)');
  });
});
