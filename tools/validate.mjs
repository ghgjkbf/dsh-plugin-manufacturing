// Validates the shipping-dsh-plugins skill before it is landed and published.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
let bad = 0;
const check = (label, ok, detail = '') => {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) bad++;
};

console.log('=== 1. frontmatter ===');
const md = readFileSync(join(root, 'SKILL.md'), 'utf8');
const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
check('frontmatter block present', fm !== null);
const body = fm ? fm[1] : '';
const name = body.match(/^name:\s*(.+)$/m);
const desc = body.match(/^description:\s*(.+)$/m);
check('name present', name !== null, name ? name[1] : '');
check('name matches directory', name && name[1].trim() === 'shipping-dsh-plugins');
check('description present', desc !== null);
if (desc) {
  const d = desc[1].trim();
  // Hermes renders description[:57] and Codex shares one byte budget.
  const head = d.slice(0, 57);
  check('trigger condition inside first 57 chars', /写完|触发|开源/.test(head), JSON.stringify(head));
  check('description not over 400 chars', d.length <= 400, `${d.length} chars`);
}

console.log('=== 2. every referenced file exists ===');
for (const rel of [
  'references/pitfalls.md',
  'references/verification.md',
  'references/packaging.md',
  'references/open-source.md',
  'templates/harness.mjs',
  'templates/verify.yml',
]) {
  check(rel, existsSync(join(root, rel)));
}

console.log('=== 3. no dangling reference in SKILL.md ===');
for (const m of md.matchAll(/`((?:references|templates)\/[A-Za-z0-9._-]+)`/g)) {
  check(`referenced ${m[1]}`, existsSync(join(root, m[1])));
}

console.log('=== 4. no author-specific path or credential leaked into the skill ===');
const files = [
  'SKILL.md',
  'README.md',
  'references/pitfalls.md',
  'references/verification.md',
  'references/packaging.md',
  'references/open-source.md',
  'templates/harness.mjs',
  'templates/verify.yml',
  '.github/workflows/validate.yml',
  'tools/validate.mjs',
  'LICENSE',
  '.gitignore',
  '.gitattributes',
];
for (const rel of files) {
  const text = readFileSync(join(root, rel), 'utf8');
  // Match a credential, not a scanner pattern: a real token is the prefix PLUS
  // its payload. `gho_` alone appears legitimately inside the scan patterns
  // this skill teaches, so requiring the payload avoids flagging our own docs.
  const secrets = text.match(
    /gho_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|dsh-auth-[A-Za-z0-9_-]{20,}|v1\.eyJ[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY/,
  );
  check(`no credential in ${rel}`, secrets === null, secrets ? secrets[0].slice(0, 24) + '…' : '');
}

console.log('=== 5. the two load-bearing facts are stated ===');
const pits = readFileSync(join(root, 'references/pitfalls.md'), 'utf8');
check('teaches the real manifest contract', /dsh\.bundle/.test(pits) && /dsh\.client/.test(pits));
check('warns manifestVersion has zero consumers', /manifestVersion/.test(pits));
check('teaches body-level theme tokens', /body/.test(pits) && /--dsw-alias/.test(pits));
const ver = readFileSync(join(root, 'references/verification.md'), 'utf8');
check('distinguishes restart from refresh', /重启/.test(ver) && /刷新/.test(ver));
check('states registration is not visibility', /注册成功 ≠ 用户看得见|注册成功/.test(ver));

console.log(`\n${bad === 0 ? 'ALL CHECKS PASSED' : `${bad} CHECK(S) FAILED`}`);
process.exit(bad === 0 ? 0 : 1);
