import { describe, expect, it } from 'vitest';
import { contentDisposition, escapeHtml } from './http';

describe('escapeHtml', () => {
  it('neutralizes markup in user-supplied text', () => {
    expect(escapeHtml(`<a href="https://evil.example">Rahul's "link"</a> & co`)).toBe(
      '&lt;a href=&quot;https://evil.example&quot;&gt;Rahul&#39;s &quot;link&quot;&lt;/a&gt; &amp; co',
    );
  });
});

describe('contentDisposition', () => {
  it('quotes a plain filename', () => {
    expect(contentDisposition('attachment', 'Q3 access review.pdf')).toBe(
      `attachment; filename="Q3 access review.pdf"; filename*=UTF-8''Q3%20access%20review.pdf`,
    );
  });

  it('strips characters that could break out of the header', () => {
    const header = contentDisposition('inline', 'evil"\r\nSet-Cookie: x=1.pdf');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toMatch(/^inline; filename="evil___Set-Cookie: x=1.pdf";/);
  });

  it('keeps non-ASCII names in the encoded form', () => {
    expect(contentDisposition('attachment', 'résumé.pdf')).toBe(
      `attachment; filename="r_sum_.pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf`,
    );
  });
});
