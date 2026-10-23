import { describe, expect, it } from 'vitest';
import { changesRequestedEmail, evidenceRequestedEmail } from './templates';

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
