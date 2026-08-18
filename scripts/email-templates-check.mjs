#!/usr/bin/env node
// Zero-dependency validator for the H~M Trading Institute branded email
// templates (supabase/email-templates/). Enforces the design system: brand
// elements present, balanced HTML tags, palette-only colors, Supabase Auth
// variable correctness, and no obvious secrets.
//
// Usage: node scripts/email-templates-check.mjs
//
// Exit code 0 = all 8 templates PASS. Non-zero = at least one FAIL, with a
// per-file list of what's wrong printed to stdout.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AUTH_DIR = path.join(ROOT, 'supabase/email-templates/auth');
const TX_DIR = path.join(ROOT, 'supabase/email-templates/transactional');

const AUTH_TEMPLATES = ['confirm-signup', 'invite-user', 'magic-link', 'reset-password', 'change-email'];
const TX_TEMPLATES = ['subscription-activated', 'renewal-failed', 'run-completed'];

// Resolved from Tradi/frontend/src/index.css, :root[data-theme="light"] --foreground.
const LIGHT_FG = '#0F0A1E';

// The ONLY hex colors allowed in any template. Keep in sync with the
// Architect design doc's "Approved palette" list and src/index.css.
const PALETTE = [
  '#FFFFFF', '#FAF5FF', '#F5F3FF', '#EDE9FE', '#0A0815', '#160E28', '#2A1845',
  '#7C3AED', '#6D28D9', '#C026D3', '#A21CAF', '#D946EF', '#F43F5E', '#FB923C',
  '#DC2626', '#16A34A', '#D97706', '#6B4D8A', LIGHT_FG,
].map((c) => c.toUpperCase());
const PALETTE_SET = new Set(PALETTE);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const PALETTE_RGB = new Set(PALETTE.map((h) => hexToRgb(h).join(',')));

// Exact Supabase Auth template variable names — anything else is a typo that
// would silently render empty in the dashboard.
const AUTH_VARS = new Set(['ConfirmationURL', 'Token', 'TokenExpiration', 'SiteURL', 'Email', 'NewEmail', 'Data']);

// Tags whose balance we verify. `br` is a void element and is exempt.
const TRACKED_TAGS = new Set(['a', 'div', 'span', 'table', 'tr', 'td', 'p', 'br']);

// API-key-shaped strings: sk_/pk_ prefixed tokens, or JWT-looking eyJ... blobs.
const SECRET_RE = /(sk|pk|eyJ)[_-]?[A-Za-z0-9]{20,}/;

function checkTagBalance(html) {
  const errors = [];
  const stack = [];
  const tagRe = /<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/)?\s*>/g;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const closing = Boolean(m[1]);
    const name = m[2].toLowerCase();
    const selfClosing = Boolean(m[3]);
    if (!TRACKED_TAGS.has(name)) continue;
    if (name === 'br') continue; // void element, exempt from balance
    if (selfClosing) continue; // e.g. <div ... /> — no closing tag expected
    if (!closing) {
      stack.push(name);
      continue;
    }
    if (stack.length === 0) {
      errors.push(`unexpected closing tag </${name}> with no matching open tag`);
      continue;
    }
    const top = stack.pop();
    if (top !== name) {
      errors.push(`tag mismatch: expected </${top}> but found </${name}>`);
    }
  }
  if (stack.length > 0) {
    errors.push(`unclosed tag(s): <${stack.join('>, <')}>`);
  }
  return errors;
}

function checkColors(html, errors) {
  const hexRe = /#[0-9A-Fa-f]{6}\b/g;
  let m;
  while ((m = hexRe.exec(html)) !== null) {
    const hex = m[0].toUpperCase();
    if (!PALETTE_SET.has(hex)) {
      errors.push(`off-palette hex color: ${hex}`);
    }
  }
  // 3-digit hex (#F00) — must not be a prefix of a 6-digit hex, so require a
  // non-hex char after the 3 digits.
  const shortHexMatches = html.match(/#[0-9A-Fa-f]{3}(?![0-9A-Fa-f])/g) ?? [];
  for (const sh of shortHexMatches) {
    errors.push(`3-digit hex color (shorthand) not allowed: ${sh} — use the 6-digit palette form`);
  }
  const rgbaRe = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[0-9.]+)?\)/gi;
  while ((m = rgbaRe.exec(html)) !== null) {
    const key = `${m[1]},${m[2]},${m[3]}`;
    if (!PALETTE_RGB.has(key)) {
      errors.push(`off-palette color: ${m[0]}`);
    }
  }
  // Named CSS colors (e.g. `color:red`) — scanned only inside style="..." values
  // so prose words can't false-positive. `transparent`, `currentColor`, and
  // `inherit` are intentionally allowed.
  const NAMED_COLORS =
    'red|green|blue|white|black|gray|grey|purple|pink|orange|yellow|cyan|magenta|' +
    'brown|navy|teal|maroon|olive|lime|aqua|fuchsia|indigo|violet|gold|silver|' +
    'coral|tomato|salmon|tan|beige|plum|turquoise|slate|khaki|crimson|orchid|' +
    'skyblue|royalblue|firebrick|whitesmoke|darkgray|darkgrey|lightgray|lightgrey';
  const namedRe = new RegExp(`(?:^|[\\s;:,(])(${NAMED_COLORS})(?=[\\s;,)!]|$)`, 'gi');
  const styleRe = /style="([^"]*)"/g;
  let st;
  while ((st = styleRe.exec(html)) !== null) {
    const styleValue = st[1];
    let nm;
    while ((nm = namedRe.exec(styleValue)) !== null) {
      errors.push(`named CSS color not allowed: ${nm[1]} (in style="${styleValue.slice(0, 80)}...")`);
    }
    // Bare hex inside style values is already covered by hexRe/shortHexMatches
    // above (they scan the whole document, which is sufficient).
  }
}

function checkSecrets(html, errors) {
  html.split('\n').forEach((line, i) => {
    if (SECRET_RE.test(line)) {
      errors.push(`possible secret on line ${i + 1}`);
    }
  });
}

function checkBrandElements(html, errors) {
  if (!html.includes('H~Mltd')) errors.push('missing lockup "H~Mltd"');
  if (!html.includes('H~M Trading Institute')) errors.push('missing footer business name "H~M Trading Institute"');
  if (!html.includes('©') && !html.includes('&copy;')) {
    errors.push('missing © (copyright) symbol — literal © or &copy; entity');
  }
  if (!html.includes('Trading Institute')) errors.push('missing "Trading Institute" text');
  if (!html.includes('support@hmtrade-business.com')) {
    errors.push('missing support placeholder support@hmtrade-business.com');
  }
  const ctaRe = /<a\b[^>]*style\s*=\s*"[^"]*background-color\s*:\s*#[0-9A-Fa-f]{6}[^"]*"[^>]*>/i;
  if (!ctaRe.test(html)) {
    errors.push('missing CTA: no <a> tag with an inline background-color style found');
  }
}

function checkBraces(html, errors) {
  const openCount = (html.match(/\{\{/g) || []).length;
  const closeCount = (html.match(/\}\}/g) || []).length;
  if (openCount !== closeCount) {
    errors.push(`unclosed {{ }} template variable — ${openCount} '{{' vs ${closeCount} '}}'`);
  }
  const varRe = /\{\{\s*\.(\w+)(?:\.\w+)?\s*\}\}/g;
  let m;
  while ((m = varRe.exec(html)) !== null) {
    if (!AUTH_VARS.has(m[1])) {
      errors.push(`unknown Supabase Auth variable: {{ .${m[1]} }}`);
    }
  }
  if (!/\{\{\s*\.ConfirmationURL\s*\}\}/.test(html) && !/\{\{\s*\.Token\s*\}\}/.test(html)) {
    errors.push('auth template must reference {{ .ConfirmationURL }} or {{ .Token }}');
  }
}

function checkTransactionalPlaceholders(html, errors) {
  if (/\{\{/.test(html)) {
    errors.push('transactional template must use [bracket] placeholders only — found "{{"');
  }
}

function checkTemplate(name, dir, isAuth) {
  const errors = [];
  const htmlPath = path.join(dir, `${name}.html`);
  const subjectPath = path.join(dir, `${name}.subject`);
  const htmlExists = existsSync(htmlPath);
  const subjectExists = existsSync(subjectPath);
  if (!htmlExists) errors.push(`missing file: ${path.relative(ROOT, htmlPath)}`);
  if (!subjectExists) errors.push(`missing file: ${path.relative(ROOT, subjectPath)}`);
  if (!htmlExists || !subjectExists) return { name, errors };

  const html = readFileSync(htmlPath, 'utf8');
  const subject = readFileSync(subjectPath, 'utf8').trim();
  if (!subject) errors.push('.subject file is empty');

  checkBrandElements(html, errors);
  checkColors(html, errors);
  checkSecrets(html, errors);
  errors.push(...checkTagBalance(html));

  if (isAuth) {
    checkBraces(html, errors);
  } else {
    checkTransactionalPlaceholders(html, errors);
  }

  return { name, errors };
}

function run() {
  const results = [
    ...AUTH_TEMPLATES.map((n) => checkTemplate(n, AUTH_DIR, true)),
    ...TX_TEMPLATES.map((n) => checkTemplate(n, TX_DIR, false)),
  ];

  let passCount = 0;
  for (const r of results) {
    if (r.errors.length === 0) {
      console.log(`PASS  ${r.name}`);
      passCount++;
    } else {
      console.log(`FAIL  ${r.name}`);
      for (const e of r.errors) console.log(`        - ${e}`);
    }
  }
  console.log(`\n${passCount}/${results.length} templates passed`);
  return passCount === results.length ? 0 : 1;
}

process.exit(run());
