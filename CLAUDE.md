# CLAUDE.md — Familietavla

Kjøkkentavle som kjører på en iPad på kjøkkenet. Den er i daglig bruk, ikke et
konsept. Ligger på `https://jorsna.github.io/familietavla/`

Barna: **Sofia** (2C, Grindbakken skole, født 2019), **Sebastian** (barnehage,
født 2022), **Ellie** (småbarnsavdeling, født 2025).

## Arbeidsform

Svar på norsk, konservativt bokmål med -en-endinger. Vær direkte og lever
ferdige filer.

**Finn aldri på innhold.** Står det ikke i ukeplanen hva barnet skal ha med på
tur, si at det mangler — ikke gjett. Samme med klokkeslett, aktiviteter og
leksetekster.

**Verifiser før levering.** All JSON skal parses (`node -e` eller `python -m
json.tool`), og endret JavaScript skal minst kjøre gjennom `node --check` som
modul. Tre ganger har en stille mislykket tekstutskifting i `index.html` tatt
ned hele tavla, fordi `getElementById(...).addEventListener` kastet og drepte
skriptet. Les filen tilbake etter endring og se at endringen faktisk er der.

**Commit selv.** Claude har skrivetilgang til repoet. Endre filene der de
ligger og commit til riktig branch — Jørgen skal ikke laste opp noe for hånd.
Det var den jobben han var lei av. Les repoet før du endrer noe, så du bygger
på det som faktisk ligger der og ikke på en lokal kopi.

Si alltid i én linje hva du committet og til hvilken branch.

Spør først ved sletting, ved endringer i workflowen, og ved alt som ikke kan
rulles tilbake uten videre. Send aldri e-post uten at Jørgen har godkjent den
konkrete meldingen.

## Struktur

To brancher med ulikt formål:

**`main`** — koden.

```
index.html                      hele tavla, én selvstendig fil
scripts/hent-kalender.mjs       henter og klassifiserer iCal
scripts/paaminnelser.mjs        valgfritt, hoppes over hvis det mangler
.github/workflows/kalender.yml  cron hvert tiende minutt
```

**`data`** — innholdet, lest direkte fra `raw.githubusercontent.com`.

```
kalender.json   roboten skriver        alle hendelser, 6 uker fram
stengt.json     roboten skriver        planleggingsdager, 180 dager fram
aks.json        lastes opp manuelt     AKS-plan per uke
lekser.json     lastes opp manuelt     lekser, info og tema per uke
manuelt.json    lastes opp manuelt     hendelser og huskepunkter med dato
middager.json   MANGLER                middagsplan per uke
```

`middager.json` ble slettet av roboten den gangen publiseringssteget
force-pushet, og er aldri lagt tilbake. `index.html` leser den som valgfri, så
tavla krasjer ikke — men ukesvisningen melder «middager» som savnet. Lag den
aldri med oppdiktede middager; den må komme fra Jørgen.

En commit til `main` utløser Pages-publisering på ett til tre minutter. Derfor
ligger dataene for seg: robotkjøringene koster ingenting og står ikke i kø
foran Jørgens egne endringer.

Publiseringssteget i workflowen kopierer **bare** `kalender.json`,
`stengt.json` og `paaminnelser.json`. Alt annet på `data`-branchen blir
stående. Ikke gjør den force-pushende igjen — det slettet `manuelt.json` og
`middager.json` én gang.

`main/data/*.json` er døde filer fra før branchdelingen. Tavla leser dem ikke.

## Dataformatene

**`aks.json`** — to aktiviteter per ukedag, nøklet på ukenummer:

```json
{ "41": { "1": ["Perling", "Ute i skogen"], "2": ["..."] } }
```

**`lekser.json`** — lekser med frist (`"1"`–`"5"` = mandag–fredag) eller uten
(`"uken"`). Hver lekse har en fast `id`. `info` er ukens beskjeder, `tema`
perioden:

```json
{ "41": {
  "uken": [{ "id": "lesing41", "tekst": "Les 15 min hver dag" }],
  "2":    [{ "id": "norsk41",  "tekst": "Norsk s. 22–23" }],
  "info": ["Klassebilde onsdag"],
  "tema": "Høst"
} }
```

Ider må være stabile. Endres en id midt i uken, nullstilles avhukingen, fordi
Supabase lagrer per id.

**`manuelt.json`** — datostyrt:

```json
{ "hendelser": [{ "dato": "2026-10-15", "barn": "sofia", "start": "09:00",
                  "slutt": "14:00", "tittel": "Tur til Vettakollen",
                  "sted": "Vettakollen", "type": "tur" }],
  "husk":      [{ "dato": "2026-10-15", "barn": "sofia",
                  "tekst": "Matpakke og drikkeflaske" }] }
```

Behold alltid inneværende uke i filene, ikke bare den nye.

## Den ukentlige rytmen

Ukeplanen fra skolen kommer på e-post **fredag ca. kl. 13:30**, fra
`noreply@info.skoleplattform.no` med emnet «Melding fra portalen: Uke NN» og
PDF-en `ukeplan-uke-NN--gri.pdf` som vedlegg. Den går til
jorgen.snarli@gmail.com, ikke til Volvo-adressen.

AKS-planen kommer **ikke** på e-post. Den må Jørgen sende selv.

Les planene, oppdater `aks.json`, `lekser.json` og `manuelt.json`, og commit
dem til `data`-branchen.

Alt som står i «Viktig informasjon» i ukeplanen skal med — klassebilder,
foreldremøter, turer, ting som skal tas med hjemmefra. Dette er glippet før.

Mangler en plan, viser tavla «AKS-plan mangler for uke 42» av seg selv.

### Faste mønstre hos skolen

- Norskleksen har frist tirsdag, matteleksen torsdag
- Salto lesebok kommer hjem mandag, skal tilbake tirsdag
- AKS har mat på tirsdag, frukt på onsdag
- Fristtekst: «i kveld» dagen før, «i dag» på dagen, borte etterpå

## Datakilder

| Kilde | Hvordan | Secret |
|---|---|---|
| Familiekalender | Google iCal, hemmelig adresse | `ICAL_FAMILIE` |
| Jørgens kalender | Google iCal | `ICAL_JORGEN` |
| Sofias Spond | egen Google-kalender Spond synker til | `ICAL_SOFIA_SPOND` |
| Sebastian | MyKid iCal per foresatt | `ICAL_SEBASTIAN` |
| Ellie | MyKid iCal per foresatt | `ICAL_ELLIE` |
| Vær | Open-Meteo, hentes i nettleseren | ingen |
| Stjerner | Supabase, `stjerner` og `stjernebruk` | anon-nøkkel i `index.html` |

Hemmelige iCal-adresser og API-nøkler skal **aldri** limes inn i en samtale.
De legges rett i GitHub Secrets.

MyKid-feeden er per **foresatt**, ikke per barn: den inneholder begge barna, og
barnets navn ligger i `LOCATION`, ikke i tittelen. Rutingen skjer derfor på
stedsfeltet, og like poster slås sammen med nøkkelen
`dato|barn|start|slutt|normalisert tittel`.

Spond eksporterer verken gruppe eller barn. Derfor har Sofia en egen
Google-kalender som Spond synker til, og alt fra den feeden tilhører henne. Får
et annet barn Spond, knekker denne rutingen.

Google bruker opptil en time på å vise en ny avtale i den hemmelige
iCal-adressen. Haster det, hører hendelsen i `manuelt.json`.

En kalenderhendelse med tittel som begynner på `Husk:` havner i huskelinjen,
ikke i tidslinjen. Det er måten begge foreldre legger inn påminnelser fra
telefonen.

## Invarianter i `index.html`

Dette er tingene som har gått i stykker før. De er bevisste valg, ikke
forglemmelser.

**Faste høyder.** Topplinjen og kolonneoverskriften har fast høyde
(`CONFIG.topphoyde`). De **måles ikke**. Måler du dem, endrer tidslinjens skala
seg mellom i dag, i morgen og uke — og det var hele klagen som førte til dette.
Topplinjen skal ikke endre seg i det hele tatt.

**Rutiner følger rammen.** `RUTINER` tegnes bare når barnet har en `RAMMER`-post
den ukedagen. Ellers dukket lillefri opp på lørdager. (Sofias lillefri,
matpakke og storefri er for øvrig kommentert ut — droppet med vilje.)

**Utenfor tidsvinduet.** Avtaler før `dagStart` eller etter `dagSlutt` tegnes
ikke, men flyttes til huskelinjen med klokkeslett. Fotballtreningen 18–19 var
usynlig før dette.

**Ordgrenser i klassifiseringen.** `includes('middag')` traff inni
«ettermiddag». Bruk `\b`-regex.

**Oppgave-ider i Supabase.** Endrer du `id` i `CONFIG.oppgaver`, blir
historikken liggende under det gamle navnet og krever SQL-opprydding (se
`rydd-morgenstell.sql`). Endrer du bare tekst eller emoji, skjer ingenting.

**Tema.** `settTema()` bytter både `body.lys`-klassen og skriver om `b.farge`
fra `fargeLys`/`fargeMork`. Begge delene må gjøres.

**Knappekobling.** Bruk `?.addEventListener`, slik at en manglende knapp ikke
tar ned hele skriptet.

**Lekser tegnes tre steder** — dagsvisning, ukesvisning og leksesiden. Endrer
du formatet, må alle tre gå gjennom `lekseListe()`.

**Tidssone.** Datoer og klokkeslett formateres med
`Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' })` for å få
`YYYY-MM-DD` og `HH:MM`. Ikke bytt til lokal tid i nettleseren.

## Layoutvalg Jørgen har landet

Én kolonne per barn pluss familien, side om side. En listevisning for mobil ble
bygget og kastet. Lys bakgrunn er standard (Idas ønske), nattdimmingen er
fjernet. Dagen går 07:30–19:30.
