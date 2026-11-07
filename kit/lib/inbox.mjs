// Validation of inbox entries (lessons and catalogue entries). Entries are data from many
// people and end up in everyone's context: keep only schema fields, plain text, capped lengths,
// no URLs or commands in lessons, no instructions, no secrets. Anything else is rejected.
export const STACKS = ['frappe', 'medusa', 'nextjs', 'rust', 'other', 'enterprise'];
export const CAUSES = ['kit-gap', 'stack-gotcha'];
const URL = /(https?:\/\/|www\.|\b[\w-]+\.(com|in|io|net|org|dev|app)\b)/i;
const CMD = /[`$;|<>{}\\]|&&|^\s*(npm|npx|pnpm|yarn|git|bench|curl|wget|rm|sudo|node|python|pip|sh|bash|cargo|docker|kubectl|ssh)\b/i;
const INSTR = /\b(ignore (all|previous|the above)|system prompt|you are (now|an?)|as an ai|assistant|claude|anthropic|disregard|override|jailbreak|always (run|execute|allow)|do not (ask|tell)|without asking|run this|execute)\b/i;
const SECRET = /(AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[abp]-|-----BEGIN|password\s*[:=]|token\s*[:=]|secret\s*[:=]|[A-Fa-f0-9]{32,}|[A-Za-z0-9+/]{40,}={0,2})/;
const IPHOST = /\b\d{1,3}(\.\d{1,3}){3}\b|\b[\w-]+\.(local|internal|lan|corp)\b/i;
const PRINTABLE = /^[\x20-\x7E -ɏ‐-‧]*$/;

function text(v, max, name, errs, { strict = false, required = true } = {}) {
  if (v === undefined || v === null || v === '') { if (required) errs.push(`${name} missing`); return ''; }
  if (typeof v !== 'string') { errs.push(`${name} not text`); return ''; }
  const s = v.trim().replace(/\s+/g, ' ');
  if (s.length > max) errs.push(`${name} over ${max} chars`);
  if (!PRINTABLE.test(s)) errs.push(`${name} has non-plain characters`);
  if (SECRET.test(s)) errs.push(`${name} looks like a secret`);
  if (IPHOST.test(s)) errs.push(`${name} names a host or IP`);
  if (INSTR.test(s)) errs.push(`${name} reads like an instruction to the model`);
  if (strict && URL.test(s)) errs.push(`${name} has a URL or domain`);
  if (strict && CMD.test(s)) errs.push(`${name} has a command or code`);
  return s;
}

export function validate(raw) {
  const errs = [];
  let e;
  try { e = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return { ok: false, errs: ['not JSON'] }; }
  if (!e || typeof e !== 'object') return { ok: false, errs: ['not an object'] };
  const meta = { machine: text(e.machine, 40, 'machine', errs), created: text(e.created, 30, 'created', errs) };
  if (meta.machine && !/^[\w.-]+$/.test(meta.machine)) errs.push('machine name invalid');
  if (e.type === 'lesson') {
    const out = {
      type: 'lesson',
      stack: STACKS.includes(e.stack) ? e.stack : (errs.push('stack invalid'), ''),
      cause: CAUSES.includes(e.cause) ? e.cause : (errs.push(e.cause === 'prompt-issue' ? 'prompt-issue lessons are not shared' : 'cause invalid'), ''),
      lesson: text(e.lesson, 160, 'lesson', errs, { strict: true }),
      fix: text(e.fix, 160, 'fix', errs, { strict: true }),
      project: text(e.project, 60, 'project', errs),
      ...meta,
    };
    return { ok: !errs.length, errs, entry: out };
  }
  if (e.type === 'catalog') {
    const c = e.entry || {};
    const out = {
      type: 'catalog',
      entry: {
        name: text(c.name, 80, 'name', errs),
        stack: ['frappe', 'medusa', 'nextjs', 'web', 'rust', 'go', 'flutter', 'python', 'other'].includes(c.stack) ? c.stack : (errs.push('stack invalid'), ''),
        repo: text(c.repo, 100, 'repo', errs, { required: false }),
        purpose: text(c.purpose, 120, 'purpose', errs, { strict: true }),
        main: Array.isArray(c.main) ? c.main.slice(0, 12).map((m, i) => text(m, 60, `main[${i}]`, errs, { strict: true })) : [],
        domain: text(c.domain, 80, 'domain', errs, { required: false, strict: true }),
        status: ['active', 'dormant', 'retired'].includes(c.status) ? c.status : (errs.push('status invalid'), ''),
      },
      ...meta,
    };
    if (out.entry.name && !/^[@\w./-]+$/.test(out.entry.name)) errs.push('name invalid');
    if (out.entry.repo && !/^[\w.-]+\/[\w.-]+$/.test(out.entry.repo)) errs.push('repo must be owner/name');
    return { ok: !errs.length, errs, entry: out };
  }
  return { ok: false, errs: ['type must be lesson or catalog'] };
}

export const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function similar(a, b) {
  const A = new Set(norm(a).split(' ')), B = new Set(norm(b).split(' '));
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / Math.max(new Set([...A, ...B]).size, 1);
}
