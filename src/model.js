// ============================================================
// model.js — Vorhersagemodell, Kalibrierung
// ============================================================

export const SEASON_FACTORS = {
  fernwaerme: { summer: 0.9, transition: 0.97, spring_fall: 1.0, winter: 1.07 },
  gas: { summer: 0.9, transition: 0.97, spring_fall: 1.0, winter: 1.08 },
  waermepumpe: { summer: 0.8, transition: 1.35, spring_fall: 1.0, winter: 2.0 },
  nachtspeicher: { summer: 0.82, transition: 1.25, spring_fall: 1.0, winter: 1.7 },
  direkt: { summer: 0.78, transition: 1.55, spring_fall: 1.0, winter: 2.5 },
};

export const DEF_PRESENCE = { home: 1.0, office: 0.55, away: 0.05 };
export const BOUNDS = { office: [0.3, 0.8], away: [0.01, 0.15], grundlast: [0.25, 0.6] };
const LR = 0.2;

export const getSeason = (m) =>
  [5, 6, 7].includes(m) ? "summer"
  : [11, 0, 1].includes(m) ? "winter"
  : [2, 4, 8, 10].includes(m) ? "transition"
  : "spring_fall";

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

export function getDefaultParams(ht = "fernwaerme") {
  return {
    grundlastShare: 0.4,
    presenceFactors: { ...DEF_PRESENCE },
    seasonFactors: { ...SEASON_FACTORS[ht] },
    lastCalibration: null,
    calibrated: false,
  };
}

export function computeBase(readings) {
  if (!readings || readings.length < 2) return null;
  const s = [...readings].sort((a, b) => new Date(a.date) - new Date(b.date));
  let tot = 0, n = 0;
  for (let i = 1; i < s.length; i++) {
    const d = daysBetween(s[i - 1].date, s[i].date);
    if (d > 0) { tot += (s[i].kwh - s[i - 1].kwh) / d; n++; }
  }
  return n > 0 ? tot / n : null;
}

export function forecastDay(date, persons, cal, params, base, nP) {
  if (!base || base <= 0) return null;
  const gl = base * params.grundlastShare;
  const pl = (base * (1 - params.grundlastShare)) / Math.max(nP, 1);
  const sf = params.seasonFactors[getSeason(new Date(date).getMonth())] || 1.0;
  let ps = 0;
  if (persons?.length) {
    for (const p of persons) {
      const e = cal.find((c) => c.date === date && c.personId === p.id);
      ps += (params.presenceFactors[e?.presenceType || "home"] ?? 1.0) * pl;
    }
  } else ps = nP * pl;
  return (gl + ps) * sf;
}

export const getConfBand = (n) =>
  n < 2 ? 0.3 : n > 5 ? 0.07 : 0.3 - ((n - 2) / 3) * 0.15;

export const getQuality = (n) =>
  n < 2 ? { l: "red", t: "Sehr ungenau", i: "🔴" }
  : n <= 5 ? { l: "yellow", t: "Eingeschränkt", i: "🟡" }
  : { l: "green", t: "Solide Basis", i: "🟢" };

export function runCalibration(readings, cal, persons, params) {
  const p = {
    ...params,
    presenceFactors: { ...params.presenceFactors },
    seasonFactors: { ...params.seasonFactors },
  };
  const s = [...readings].sort((a, b) => new Date(a.date) - new Date(b.date));
  if (s.length < 2) return p;
  const base = computeBase(s);
  if (!base) return p;

  const vacs = [];
  for (let i = 1; i < s.length; i++) {
    const days = daysBetween(s[i - 1].date, s[i].date);
    if (days < 1) continue;
    const daily = (s[i].kwh - s[i - 1].kwh) / days;
    let allAway = true;
    for (let d = 0; d < days && allAway; d++) {
      const cd = new Date(s[i - 1].date);
      cd.setDate(cd.getDate() + d);
      const ds = cd.toISOString().split("T")[0];
      for (const pe of persons) {
        const e = cal.find((c) => c.date === ds && c.personId === pe.id);
        if (!e || e.presenceType !== "away") { allAway = false; break; }
      }
    }
    if (allAway && days >= 3) vacs.push(daily);
  }

  if (vacs.length) {
    const avg = vacs.reduce((a, b) => a + b, 0) / vacs.length;
    const target = clamp(avg / base, BOUNDS.grundlast[0], BOUNDS.grundlast[1]);
    p.grundlastShare = clamp(
      p.grundlastShare + LR * (target - p.grundlastShare),
      BOUNDS.grundlast[0], BOUNDS.grundlast[1]
    );
  }

  p.calibrated = true;
  p.lastCalibration = new Date().toISOString();
  return p;
}
