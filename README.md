# Familietavla

Kjøkkentavle for familien, vist på en iPad. Henter data fra Google Calendar,
MyKid og Spond, og viser dagen, uken, lekser og stjerner for Sofia, Sebastian
og Ellie.

Ligger på `https://jorsna.github.io/familietavla/`

---

## To brancher, to formål

**`main`** er koden. Her redigerer du selv.

```
index.html                      hele tavla, én fil
scripts/hent-kalender.mjs       henter og klassifiserer kalenderdata
.github/workflows/kalender.yml  kjører skriptet hvert tiende minutt
```

**`data`** er innholdet. Tavla leser herfra, direkte fra
`raw.githubusercontent.com`.

```
kalender.json      skrives av roboten — alle hendelser, 6 uker fram
stengt.json        skrives av roboten — planleggingsdager, 180 dager fram
aks.json           AKS-plan per uke
lekser.json        lekser og ukeplan per uke
manuelt.json       hendelser og huskepunkter med dato
middager.json      middagsplan per uke — finnes ikke nå, se nedenfor
```

Roboten rører bare sine egne to filer. Alt annet på `data` blir stående.

**Hvorfor delt:** en commit til `main` utløser en Pages-publisering på ett til
tre minutter. Lå dataene der, ville robotens oppdateringer stått i kø foran
dine egne endringer. Nå koster datakjøringer ingenting.

---

## Hvor ting lastes opp

| Hva | Hvor | Publisering |
|---|---|---|
| `index.html` | `main`, rota | ja, 1–3 min |
| `hent-kalender.mjs` | `main`, `scripts/` | ja |
| `kalender.yml` | `main`, `.github/workflows/` | ja |
| AKS, lekser, middager, manuelt | **`data`-branchen**, rota | nei, ute straks |

Den vanligste feilen er å blande `data`-**mappen** på `main` med
`data`-**branchen**. Sjekk alltid branchvelgeren over fillisten.
Adressen skal si `/tree/data`, ikke `/tree/main/data`.

---

## Datakilder

| Kilde | Hvordan | Secret |
|---|---|---|
| Familiekalender | Google iCal, hemmelig adresse | `ICAL_FAMILIE` |
| Sofias Spond | egen Google-kalender, Spond synker dit | `ICAL_SOFIA_SPOND` |
| Sebastian | MyKid iCal per foresatt | `ICAL_SEBASTIAN` |
| Ellie | MyKid iCal per foresatt | `ICAL_ELLIE` |
| Vær | Open-Meteo, hentes i nettleseren | ingen |
| Stjerner | Supabase, tabellene `stjerner` og `stjernebruk` | anon-nøkkel i `index.html` |

MyKid-feeden er per **foresatt**, ikke per barn — den inneholder begge barna,
og barnets navn ligger i stedsfeltet. Rutingen skjer derfor på det feltet, og
like poster slås sammen til slutt.

Spond eksporterer verken gruppe eller barn. Derfor har Sofia en egen
Google-kalender som Spond synker til, og alt fra den feeden tilhører henne.

---

## Ukentlig rytme

Torsdag eller fredag kommer AKS-planen og skolens ukeplan. Send begge til
Claude, få `aks.json`, `lekser.json` og `manuelt.json` i retur, last dem opp
til `data`-branchen.

Mangler en plan, står det «AKS-plan mangler for uke 42» i Sofias kolonne og en
gul stripe i ukesvisningen.

---

## Visninger

**I dag** og **I morgen** — tidslinje 07:30–19:30, én kolonne per barn pluss
familien. Etter klokka 18 åpner tavla på morgendagen.

**Uke** — mandag til søndag, bare det som skiller dagene. Egne rader for lekser
og middag. Piler blar én uke tilbake og fem fram.

**📖 Lekser** — hele ukens hjemmearbeid med frister, ukens informasjon fra
skolen, og periodens tema. Kan hukes av. Egen adresse: `#lekser`

**⭐ Stjerner** — barna nedover, oppgavene bortover. Trykk gir stjerne og
konfetti. Ukesmål per barn, oppsparte stjerner, ukesoversikt. Langt trykk på
«oppsparte» løser inn. Egen adresse: `#stjerner`

---

## Ting som er lett å glemme

**Faste høyder.** Topplinjen er 74 px og kolonneoverskriften 104 px, satt i
`CONFIG.topphoyde`. De måles ikke, fordi tidslinjens skala da ville endret seg
fra dag til dag.

**Rutiner følger rammen.** Lillefri og storefri vises bare når barnet har en
ramme den dagen. Ellers dukket de opp på lørdager.

**Utenfor tidsvinduet.** Avtaler før 07:30 eller etter 19:30 tegnes ikke, men
havner i huskelinjen med klokkeslett.

**Lekse-ider.** Hver lekse har en fast id i `lekser.json`. Endres ider midt i
uken, nullstilles avhukingen.

**Google henger etter.** Den hemmelige iCal-adressen kan bruke opptil en time
på å vise en ny avtale. Haster det, skriv den inn i `manuelt.json` i stedet.

**Oppgave-ider i Supabase.** Endrer du `id` på en oppgave i `CONFIG.oppgaver`,
blir historikken liggende under det gamle navnet. Det krever en SQL-opprydding.
Endrer du bare tekst eller emoji, skjer ingenting.
