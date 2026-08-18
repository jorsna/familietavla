/**
 * hent-kalender.mjs
 *
 * Henter familiekalenderen fra Google Calendar og barnehagekalenderne
 * fra MyKid, pakker ut gjentakende hendelser, klassifiserer dem og
 * skriver data/kalender.json som familietavla leser.
 *
 * Kjøres av GitHub Actions. Alle adresser ligger i repoets Secrets.
 */

import ical from 'node-ical';
import { writeFile, mkdir } from 'node:fs/promises';

/* ── Innstillinger ─────────────────────────────────────────── */

const DAGER_FRAM = 14;
const TIDSSONE = 'Europe/Oslo';

/**
 * Feeder.
 *  barn: null  → ruting skjer på navn i tittelen (Google-kalendere)
 *  barn: 'id'  → alt fra feeden tilhører dette barnet (MyKid)
 *  rutinesjekk: true → titler som går igjen dempes til rutine
 */
const FEEDER = [
  { navn: 'familie',   url: process.env.ICAL_FAMILIE,   barn: null },
  { navn: 'jorgen',    url: process.env.ICAL_JORGEN,    barn: null },
  { navn: 'sebastian', url: process.env.ICAL_SEBASTIAN, barn: 'sebastian', rutinesjekk: true },
  { navn: 'ellie',     url: process.env.ICAL_ELLIE,     barn: 'ellie',     rutinesjekk: true }
].filter(f => f.url);

// Ruting på navn, brukes bare for feeder uten fast barn
const NAVN = {
  sofia:     ['sofia'],
  sebastian: ['sebastian'],
  ellie:     ['ellie']
};

const MATORD = [
  'frokost', 'lunsj', 'varmlunsj', 'måltid', 'ettermiddagsmat', 'matpakke',
  'middag', 'taco', 'pizza', 'grilling', 'frukt'
];

// Titler som ikke er verdt plass på en kjøkkentavle
const IGNORER = [/^månedstema/i, /^ukas hjelpere/i];

// Titler som betyr at barnehagen er stengt
const STENGT = [/planleggingsdag/i, /stengt/i];

// Hvor mange ulike dager en tittel må gå igjen på før den regnes som rutine
const RUTINEGRENSE = 4;

/* ── Hjelpere ──────────────────────────────────────────────── */

const datoFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TIDSSONE, year: 'numeric', month: '2-digit', day: '2-digit'
});
const tidFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TIDSSONE, hour: '2-digit', minute: '2-digit', hour12: false
});

const tilDato = d => datoFmt.format(d);
const tilTid  = d => tidFmt.format(d);

const normaliser = t => (t || '').toLowerCase().replace(/[!.:\s]+$/, '').trim();

function finnBarnFraTittel(tittel) {
  const t = (tittel || '').toLowerCase();
  for (const [id, ord] of Object.entries(NAVN)) {
    if (ord.some(o => t.includes(o))) return id;
  }
  return 'familie';
}

function ryddTittel(tittel) {
  return (tittel || '')
    .replace(/^\s*(sofia|sebastian|ellie)\s*[:\-–]\s*/i, '')
    .replace(/\s+$/, '')
    .trim();
}

const erMat     = t => MATORD.some(o => normaliser(t).includes(o));
const skalIgnoreres = t => IGNORER.some(r => r.test(t || ''));
const erStengt  = t => STENGT.some(r => r.test(t || ''));

function erHeldags(ev) {
  if (ev.datetype === 'date') return true;
  return (ev.end - ev.start) >= 23 * 3600 * 1000;
}

/* ── Utpakking av gjentakende hendelser ────────────────────── */

function pakkUt(ev, fra, til) {
  const treff = [];

  if (!ev.rrule) {
    if (ev.end > fra && ev.start < til) treff.push({ start: ev.start, slutt: ev.end });
    return treff;
  }

  const varighet = ev.end - ev.start;
  const unntak = new Set(Object.values(ev.exdate || {}).map(d => tilDato(d)));

  const endringer = new Map();
  for (const rec of Object.values(ev.recurrences || {})) {
    endringer.set(tilDato(rec.start), rec);
  }

  for (const start of ev.rrule.between(fra, til, true)) {
    const noekkel = tilDato(start);
    if (unntak.has(noekkel)) continue;

    const endret = endringer.get(noekkel);
    if (endret) treff.push({ start: endret.start, slutt: endret.end, overstyrt: endret });
    else treff.push({ start, slutt: new Date(start.getTime() + varighet) });
  }

  return treff;
}

/* ── Hovedløp ──────────────────────────────────────────────── */

async function main() {
  if (!FEEDER.length) {
    console.error('Ingen iCal-adresser funnet. Sjekk at secrets er satt.');
    process.exit(1);
  }

  const naa = new Date();
  const fra = new Date(naa.getFullYear(), naa.getMonth(), naa.getDate());
  const til = new Date(fra.getTime() + DAGER_FRAM * 86400000);

  const raa = [];

  for (const feed of FEEDER) {
    let data;
    try {
      data = await ical.async.fromURL(feed.url.replace(/^webcal:\/\//, 'https://'));
    } catch (e) {
      console.error(`Klarte ikke hente ${feed.navn}: ${e.message}`);
      continue;
    }

    for (const ev of Object.values(data)) {
      if (ev.type !== 'VEVENT') continue;
      if (ev.status === 'CANCELLED') continue;
      if (skalIgnoreres(ev.summary)) continue;

      for (const forekomst of pakkUt(ev, fra, til)) {
        const kilde = forekomst.overstyrt || ev;
        const tittel = ryddTittel(kilde.summary);
        if (!tittel) continue;

        raa.push({
          feed,
          dato: tilDato(forekomst.start),
          tittel,
          sted: (kilde.location || '').split(',')[0].trim(),
          heldags: erHeldags(kilde),
          start: tilTid(forekomst.start),
          slutt: tilTid(forekomst.slutt)
        });
      }
    }
  }

  /* Frekvenstelling: går en tittel igjen dag etter dag, er den rutine.
     Dukker den opp én gang, er den dagens aktivitet. Ingen ordliste
     å vedlikeholde når barnehagen finner på noe nytt. */
  const frekvens = new Map();
  for (const p of raa) {
    if (!p.feed.rutinesjekk || p.heldags) continue;
    const noekkel = `${p.feed.navn}|${normaliser(p.tittel)}`;
    if (!frekvens.has(noekkel)) frekvens.set(noekkel, new Set());
    frekvens.get(noekkel).add(p.dato);
  }

  const dager = {};

  for (const p of raa) {
    const barn = p.feed.barn || finnBarnFraTittel(p.tittel);
    const post = { barn, tittel: p.tittel, kilde: p.feed.barn ? 'mykid' : 'kalender' };
    if (p.sted) post.sted = p.sted;

    if (p.heldags) {
      post.heldags = true;
      if (erStengt(p.tittel)) post.stengt = true;
    } else {
      post.start = p.start;
      post.slutt = p.slutt;

      if (erMat(p.tittel)) {
        post.type = 'mat';
      } else if (p.feed.rutinesjekk) {
        const antall = frekvens.get(`${p.feed.navn}|${normaliser(p.tittel)}`)?.size || 1;
        post.type = antall >= RUTINEGRENSE ? 'rutine' : (antall > 1 ? 'okt' : 'spesiell');
      } else {
        post.type = 'spesiell';
      }
    }

    if (!dager[p.dato]) dager[p.dato] = [];
    dager[p.dato].push(post);
  }

  for (const dato of Object.keys(dager)) {
    dager[dato].sort((a, b) => {
      if (a.heldags !== b.heldags) return a.heldags ? -1 : 1;
      return (a.start || '').localeCompare(b.start || '');
    });
  }

  await mkdir('data', { recursive: true });
  await writeFile(
    'data/kalender.json',
    JSON.stringify({ generert: naa.toISOString(), dager }, null, 2)
  );

  const antall = Object.values(dager).reduce((n, d) => n + d.length, 0);
  console.log(`Skrev ${antall} hendelser fordelt på ${Object.keys(dager).length} dager.`);
}

main().catch(e => { console.error(e); process.exit(1); });
