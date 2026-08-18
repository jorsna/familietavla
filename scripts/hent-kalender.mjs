/**
 * hent-kalender.mjs
 *
 * Henter familiekalenderen fra Google Calendar og barnehagekalenderen
 * fra MyKid, pakker ut gjentakende hendelser, klassifiserer dem og
 * skriver data/kalender.json som familietavla leser.
 *
 * Merk: MyKid-feeden er per foresatt, ikke per barn. Den inneholder
 * alle barna dine, og barnets navn ligger i stedsfeltet. Rutingen
 * skjer derfor på stedsfeltet, og like poster slås sammen til slutt.
 */

import ical from 'node-ical';
import { writeFile, mkdir } from 'node:fs/promises';

/* ── Innstillinger ─────────────────────────────────────────── */

const DAGER_FRAM = 14;                 // detaljert program på tavla
const VID_VINDU = 180;                 // hvor langt fram vi leter etter stengte dager
const TIDSSONE = 'Europe/Oslo';

const FEEDER = [
  { navn: 'familie',   url: process.env.ICAL_FAMILIE,   type: 'google' },
  { navn: 'jorgen',    url: process.env.ICAL_JORGEN,    type: 'google' },
  { navn: 'sebastian', url: process.env.ICAL_SEBASTIAN, type: 'mykid' },
  { navn: 'ellie',     url: process.env.ICAL_ELLIE,     type: 'mykid' }
].filter(f => f.url);

// Navn som identifiserer et barn, både i tittel og i stedsfelt
const NAVN = {
  sofia:     ['sofia'],
  sebastian: ['sebastian'],
  ellie:     ['ellie']
};

/* Måltider. Ordgrensene er ikke pynt: uten dem treffer «middag»
   inni «ettermiddag», og hele ettermiddagen blir gul. */
const MATMOENSTRE = [
  /\bfrokost/i,
  /lunsj\b/i,            // treffer både «lunsj» og «varmlunsj»
  /\bmåltid/i,
  /ettermiddagsmat/i,
  /matpakke/i,
  /\bmiddag\b/i,
  /\bfrukt\b/i,
  /\btaco\b/i,
  /\bpizza\b/i,
  /grilling/i
];

const IGNORER = [/^månedstema/i, /^ukas hjelpere/i];
const STENGT  = [/planleggingsdag/i, /stengt/i];

// Hvor mange ulike dager en tittel må gå igjen på for å regnes som rutine
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

function finnBarn(tekst) {
  const t = (tekst || '').toLowerCase();
  for (const [id, ord] of Object.entries(NAVN)) {
    if (ord.some(o => t.includes(o))) return id;
  }
  return null;
}

function ryddTittel(tittel) {
  return (tittel || '')
    .replace(/^\s*(sofia|sebastian|ellie)\s*[:\-–]\s*/i, '')
    .replace(/\s*:\s*$/, '')     // «De eldste på tur:» → «De eldste på tur»
    .trim();
}

const erMat         = t => MATMOENSTRE.some(r => r.test(t || ''));
const skalIgnoreres = t => IGNORER.some(r => r.test(t || ''));
const erStengt      = t => STENGT.some(r => r.test(t || ''));

function erHeldags(ev) {
  if (ev.datetype === 'date') return true;
  return (ev.end - ev.start) >= 23 * 3600 * 1000;
}

function ryddSted(sted) {
  return (sted || '').split(/[\n,]/)[0].trim();
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
  const tilVid = new Date(fra.getTime() + VID_VINDU * 86400000);

  const raa = [];
  const stengteDager = [];

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

      for (const forekomst of pakkUt(ev, fra, tilVid)) {
        const kilde = forekomst.overstyrt || ev;
        const tittel = ryddTittel(kilde.summary);
        if (!tittel) continue;

        const sted = ryddSted(kilde.location);
        const dato = tilDato(forekomst.start);

        const barn = feed.type === 'mykid'
          ? (finnBarn(sted) || feed.navn)
          : (finnBarn(kilde.summary) || 'familie');

        /* Stengte dager samles for hele halvåret. Å oppdage en
           planleggingsdag samme morgen er den dyreste feilen tavla
           kan la gå gjennom. */
        if (feed.type === 'mykid' && erStengt(tittel)) {
          stengteDager.push({ dato, tittel, barn });
        }

        // Detaljert program bare for de nærmeste dagene
        if (forekomst.start >= til) continue;

        raa.push({
          feedtype: feed.type,
          barn,
          dato,
          tittel,
          sted: feed.type === 'mykid' ? '' : sted,
          heldags: erHeldags(kilde),
          start: tilTid(forekomst.start),
          slutt: tilTid(forekomst.slutt)
        });
      }
    }
  }

  /* Slå sammen like poster. Begge MyKid-feedene leverer hele
     familien, så uten dette får du alt to ganger. */
  const sett = new Set();
  const unike = raa.filter(p => {
    const noekkel = `${p.dato}|${p.barn}|${p.start}|${p.slutt}|${normaliser(p.tittel)}`;
    if (sett.has(noekkel)) return false;
    sett.add(noekkel);
    return true;
  });

  /* Frekvenstelling per barn: går en tittel igjen dag etter dag, er
     den rutine. Dukker den opp én gang, er den dagens aktivitet. */
  const frekvens = new Map();
  for (const p of unike) {
    if (p.feedtype !== 'mykid' || p.heldags) continue;
    const noekkel = `${p.barn}|${normaliser(p.tittel)}`;
    if (!frekvens.has(noekkel)) frekvens.set(noekkel, new Set());
    frekvens.get(noekkel).add(p.dato);
  }

  const dager = {};

  for (const p of unike) {
    /* "Husk: gymtøy" i kalenderen havner i huskelinja nederst,
       ikke i tidslinja. Da kan begge foreldre legge inn en
       påminnelse fra mobilen uten å røre noen fil. */
    if (/^husk\b/i.test(p.tittel)) {
      if (!dager[p.dato]) dager[p.dato] = [];
      dager[p.dato].push({
        barn: p.barn,
        tittel: p.tittel.replace(/^husk\s*[:\-–]?\s*/i, '').trim() || p.tittel,
        type: 'husk',
        kilde: 'kalender'
      });
      continue;
    }

    const post = {
      barn: p.barn,
      tittel: p.tittel,
      kilde: p.feedtype === 'mykid' ? 'mykid' : 'kalender'
    };
    if (p.sted) post.sted = p.sted;

    if (p.heldags) {
      post.heldags = true;
      if (erStengt(p.tittel)) post.stengt = true;
    } else {
      post.start = p.start;
      post.slutt = p.slutt;

      if (erMat(p.tittel)) {
        post.type = 'mat';
      } else if (p.feedtype === 'mykid') {
        const antall = frekvens.get(`${p.barn}|${normaliser(p.tittel)}`)?.size || 1;
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

  // Stengte dager: én oppføring per dato, sortert
  const settDato = new Set();
  const stengt = stengteDager
    .filter(s => { if (settDato.has(s.dato)) return false; settDato.add(s.dato); return true; })
    .sort((a, b) => a.dato.localeCompare(b.dato));

  await writeFile(
    'data/stengt.json',
    JSON.stringify({ generert: naa.toISOString(), dager: stengt }, null, 2)
  );

  const antall = Object.values(dager).reduce((n, d) => n + d.length, 0);
  console.log(`Skrev ${antall} hendelser fordelt på ${Object.keys(dager).length} dager.`);
  console.log(`Fjernet ${raa.length - unike.length} duplikater.`);
  console.log(`Fant ${stengt.length} stengte dager de neste ${VID_VINDU} dagene.`);
}

main().catch(e => { console.error(e); process.exit(1); });
