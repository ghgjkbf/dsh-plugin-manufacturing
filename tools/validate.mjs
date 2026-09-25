// Validates the dsh-plugin-manufacturing skill before it is landed and published.
import { readFileSync, existsSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';

const root = process.argv[2];
let bad = 0;
const check = (label, ok, detail = '') => {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) bad++;
};

// The skill must live in a directory named after it, because the `skills` CLI
// derives the install name from either the frontmatter or the directory and a
// mismatch is rejected at install time.
const dirName = basename(resolve(root));

console.log('=== 1. frontmatter ===');
const md = readFileSync(join(root, 'SKILL.md'), 'utf8');
const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
check('frontmatter block present', fm !== null);
const body = fm ? fm[1] : '';
const name = body.match(/^name:\s*(.+)$/m);
const desc = body.match(/^description:\s*(.+)$/m);
check('name present', name !== null, name ? name[1] : '');
const skillName = name ? name[1].trim() : '';
check('name matches directory', skillName === dirName, `${skillName} vs ${dirName}`);
check('name is kebab-case', /^[a-z][a-z0-9-]*$/.test(skillName));
check('description present', desc !== null);
if (desc) {
  const d = desc[1].trim();
  // Hermes renders description[:57]; Codex shares one byte budget across all skills.
  const head = d.slice(0, 57);
  check('trigger condition inside first 57 chars', /造|写|触发|开源/.test(head), JSON.stringify(head));
  check('description not over 400 chars', d.length <= 400, `${d.length} chars`);
}

console.log('=== 2. every referenced file exists ===');
const refs = [
  'references/authoring.md',
  'references/pitfalls.md',
  'references/verification.md',
  'references/packaging.md',
  'references/open-source.md',
  'templates/harness.mjs',
  'templates/verify.yml',
];
for (const rel of refs) check(rel, existsSync(join(root, rel)));

console.log('=== 3. no dangling reference in SKILL.md ===');
for (const m of md.matchAll(/`((?:references|templates)\/[A-Za-z0-9._-]+)`/g)) {
  check(`referenced ${m[1]}`, existsSync(join(root, m[1])));
}

console.log('=== 4. no author-specific path or credential leaked into the skill ===');
const files = [
  'SKILL.md',
  'README.md',
  ...refs,
  '.github/workflows/validate.yml',
  'tools/validate.mjs',
  'LICENSE',
  '.gitignore',
  '.gitattributes',
];
for (const rel of files) {
  if (!existsSync(join(root, rel))) continue;
  const text = readFileSync(join(root, rel), 'utf8');
  // A real credential is prefix PLUS payload. Bare `gho_` / `dsh-auth-` appear
  // legitimately inside the very patterns this skill teaches about scanning.
  const secrets = text.match(
    /gho_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|dsh-auth-[A-Za-z0-9_-]{20,}|v1\.eyJ[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY/,
  );
  check(`no credential in ${rel}`, secrets === null, secrets ? secrets[0].slice(0, 24) + '…' : '');
}

console.log('=== 4b. no absolute author path (outside an illustrative example) ===');
for (const rel of files) {
  if (!existsSync(join(root, rel))) continue;
  const text = readFileSync(join(root, rel), 'utf8');
  const hits = [...text.matchAll(/C:\\Users\\[A-Za-z]+|\/Users\/[A-Za-z]+\/|\/home\/[A-Za-z]+\//g)];
  check(`no author path in ${rel}`, hits.length === 0, hits.length ? hits[0][0] : '');
}

console.log('=== 5. the load-bearing facts are stated ===');
const pits = readFileSync(join(root, 'references/pitfalls.md'), 'utf8');
const auth = readFileSync(join(root, 'references/authoring.md'), 'utf8');
const ver = readFileSync(join(root, 'references/verification.md'), 'utf8');

check(
  'warns that a same-id patch row replaces (not merges) the upstream row',
  /按 row id|row id.*覆盖|整条替换/.test(pits + md),
);
check('teaches the real manifest contract', /dsh\.bundle/.test(pits) && /dsh\.client/.test(pits));
check('warns the invented field has zero consumers', /manifestVersion/.test(pits));
check('teaches body-level theme tokens', /body/.test(pits) && /--dsw-alias/.test(pits));
check('distinguishes restart from refresh', /重启/.test(ver) && /刷新/.test(ver));
check(
  'states registration is not visibility',
  /注册成功 ≠ 用户看得见/.test(pits + ver + md),
);
check(
  'carries the official no-client-package prohibition',
  /不得 `require`/.test(auth) && /dsh-client-ui-primitives/.test(auth),
);
check(
  'carries the no-new-event-type prohibition',
  /新 `type`|新事件类型/.test(auth),
);
check(
  'records that the bare client.js claim was previously wrong',
  /上一版写错|裸\s*`client\.js`\s*不匹配/.test(pits),
);

console.log(`\n${bad === 0 ? 'ALL CHECKS PASSED' : `${bad} CHECK(S) FAILED`}`);
process.exit(bad === 0 ? 0 : 1);
