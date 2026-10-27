import { addDays } from "@/lib/dates";
import { fold } from "@/lib/text";

export type CaptureKind = "task" | "idea" | "event";

export type Parsed = {
  kind: CaptureKind;
  title: string;
  /** YYYY-MM-DD */
  due: string | null;
  /** HH:MM, only when the text names an hour */
  time: string | null;
  /** Raw #tags without the hash */
  tags: string[];
};

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const pad = (n: number) => String(n).padStart(2, "0");
const validDay = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/** Removes `match` from the text and tidies the whitespace left behind. */
const cut = (text: string, match: string) => text.replace(match, " ").replace(/\s{2,}/g, " ").trim();

const KIND_PREFIXES: [RegExp, CaptureKind][] = [
  [/^\s*(?:id[ée]e|idea|note)\s*[:\-–]\s*/i, "idea"],
  [/^\s*(?:💡)\s*/u, "idea"],
  [/^\s*(?:rdv|rendez-vous|[ée]v[ée]nement|event|r[ée]union)\s*[:\-–]\s*/i, "event"],
];

/**
 * Reads a one-line capture. French dates (aujourd'hui, demain, a weekday, 12/11),
 * an optional hour (18h, 18h30), #tags, and a kind prefix ("idée :", "rdv :").
 * Weekdays always mean the next occurrence after today.
 */
export function parseCapture(input: string, today: string): Parsed {
  let text = input.trim();
  let kind: CaptureKind = "task";
  for (const [re, k] of KIND_PREFIXES) {
    if (re.test(text)) {
      kind = k;
      text = text.replace(re, "");
      break;
    }
  }

  const tags: string[] = [];
  text = text.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (_, sp: string, tag: string) => {
    tags.push(tag);
    return sp;
  });

  let time: string | null = null;
  const hour = text.match(/(?:^|\s)(?:à\s+)?(\d{1,2})\s*(?:h|:)\s*(\d{2})?(?=\s|$|[.,;])/i);
  if (hour && Number(hour[1]) < 24 && (hour[2] === undefined || Number(hour[2]) < 60)) {
    time = `${pad(Number(hour[1]))}:${hour[2] ?? "00"}`;
    text = cut(text, hour[0]);
  }

  let due: string | null = null;
  const folded = fold(text);
  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = folded.match(re);
    if (!m || m.index === undefined) return null;
    // `fold` keeps one character per character except for stripped accents; locate the span in the original.
    const at = alignIndex(text, m.index);
    const end = alignIndex(text, m.index + m[0].length);
    text = cut(text, text.slice(at, end));
    return m;
  };

  let m: RegExpMatchArray | null;
  if ((m = take(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s|$|[.,;])/))) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const explicitYear = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
    const year = Number(today.slice(0, 4));
    if (explicitYear && validDay(explicitYear, mo, d)) due = `${explicitYear}-${pad(mo)}-${pad(d)}`;
    else if (!explicitYear && validDay(year, mo, d)) {
      const candidate = `${year}-${pad(mo)}-${pad(d)}`;
      due = candidate < today ? (validDay(year + 1, mo, d) ? `${year + 1}-${pad(mo)}-${pad(d)}` : null) : candidate;
    }
  } else if ((m = take(/(?:^|\s)apres[- ]demain(?=\s|$|[.,;])/))) due = addDays(today, 2);
  else if ((m = take(/(?:^|\s)demain(?=\s|$|[.,;])/))) due = addDays(today, 1);
  else if ((m = take(/(?:^|\s)(?:aujourd'?\s?hui|ajd|ce soir)(?=\s|$|[.,;])/))) due = today;
  else if ((m = take(/(?:^|\s)dans\s+(\d{1,3})\s+(jours?|semaines?)(?=\s|$|[.,;])/))) {
    due = addDays(today, Number(m[1]) * (m[2].startsWith("semaine") ? 7 : 1));
  } else if ((m = take(new RegExp(`(?:^|\\s)(${WEEKDAYS.slice(1).concat("dimanche").join("|")})(?:\\s+prochain)?(?=\\s|$|[.,;])`)))) {
    const target = WEEKDAYS.indexOf(m[1]);
    const delta = ((target - weekdayOf(today) + 7) % 7) || 7;
    due = addDays(today, delta);
  }

  // A bare "18h" with no day means today, as long as something was captured with an hour.
  if (time && !due) due = today;

  return { kind, title: text.replace(/^[\s,;:\-–]+|[\s,;:\-–]+$/g, ""), due, time, tags };
}

/** Maps an index in `fold(text)` back onto `text`: folding only ever removes combining marks. */
function alignIndex(text: string, foldedIndex: number): number {
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (seen >= foldedIndex) return i;
    seen += fold(text[i]).length;
  }
  return text.length;
}

export type ProjectRef = { id: string; name: string };

/** A tag names a project when it equals the name, or starts one of its words (3+ characters), and only one project fits. */
export function matchTag(tag: string, projects: ProjectRef[]): ProjectRef | null {
  const t = fold(tag).replace(/[-_]/g, "");
  if (t.length < 2) return null;
  const exact = projects.filter((p) => fold(p.name).replace(/[^a-z0-9]/g, "") === t);
  if (exact.length === 1) return exact[0];
  if (t.length < 3) return null;
  const partial = projects.filter((p) => fold(p.name).split(/[^a-z0-9]+/).some((w) => w.startsWith(t)));
  return partial.length === 1 ? partial[0] : null;
}

export type Rule = { pattern: string; sourceId: string; projectId: string | null };
export type TaskSourceRef = { id: string; kind: "notion" | "linear"; projectName?: string; ticketPattern?: string };

export type Destination = { sourceId: string; projectId: string | null; why: "tag" | "rule" | "ticket" };

/** `re:<regex>` or a keyword matched against tags and words, accent-insensitive. */
export function ruleMatches(pattern: string, parsed: Pick<Parsed, "title" | "tags">): boolean {
  const p = pattern.trim();
  if (p.toLowerCase().startsWith("re:")) {
    try {
      return new RegExp(p.slice(3), "i").test(parsed.title);
    } catch {
      return false;
    }
  }
  const key = fold(p.replace(/^#/, ""));
  if (!key) return false;
  if (parsed.tags.some((t) => fold(t) === key)) return true;
  return fold(parsed.title).split(/[^a-z0-9]+/).includes(key);
}

/**
 * Where a capture goes when the destination is obvious: an explicit rule, a ticket
 * pattern (COV-14 → the Linear source whose team owns it), or a #tag naming a project.
 * Returns null when it has to wait in the inbox.
 */
export function suggestDestination(
  parsed: Parsed,
  ctx: { rules: Rule[]; projects: ProjectRef[]; sources: TaskSourceRef[]; sourceOfProject: (projectId: string) => string | null },
): Destination | null {
  for (const r of ctx.rules) if (ruleMatches(r.pattern, parsed)) return { sourceId: r.sourceId, projectId: r.projectId, why: "rule" };

  const ticket = parsed.title.match(/\b([A-Z]{2,6})-\d+\b/);
  if (ticket) {
    const s = ctx.sources.find((x) => x.kind === "linear" && x.ticketPattern === ticket[1]);
    if (s) return { sourceId: s.id, projectId: null, why: "ticket" };
  }

  for (const tag of parsed.tags) {
    const project = matchTag(tag, ctx.projects);
    const sourceId = project ? ctx.sourceOfProject(project.id) : null;
    if (project && sourceId) return { sourceId, projectId: project.id, why: "tag" };
  }
  return null;
}
