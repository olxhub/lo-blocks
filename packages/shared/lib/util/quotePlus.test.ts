// Verify byte-for-byte compatibility with Python's
// urllib.parse.quote_plus(string, safe='@').
//
// Each test case runs Python and compares output directly — no hardcoded
// expected values to drift out of sync.

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { quotePlus } from './quotePlus';

/** Run Python's urllib.parse.quote_plus(s, safe='@') and return the result. */
function pythonQuotePlus(s: string): string {
  return execSync(
    'python3 -c "import sys; from urllib.parse import quote_plus; print(quote_plus(sys.stdin.read(), safe=\'@\'), end=\'\')"',
    { input: s }
  ).toString();
}

describe('quotePlus matches Python urllib.parse.quote_plus(s, safe="@")', () => {
  const cases = [
    '1234; DROP TABLE *',   // LO auth/events.py doctest
    'user@example.com',     // @ is safe
    'hello world',          // space → +
    "!*'()",                // RFC 2396 marks that Python encodes
    'a-b_c.d~e',           // unreserved chars
    '',                     // empty
    '陈美琳',               // unicode
    'a/b?c=d&e=f#g',       // URL-ish characters
  ];

  for (const input of cases) {
    it(JSON.stringify(input), () => {
      expect(quotePlus(input)).toBe(pythonQuotePlus(input));
    });
  }
});
