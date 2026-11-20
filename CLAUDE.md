# Pipeslipp – julebrus-spill for Mack

Jobbprosjekt for Macks Ølbryggeri. Et lite nettleserspill der nissen slipper julebrus fra sleden ned i pipene. Det skal deles på sosiale medier og kunne bygges inn på mack.no med iframe.

Skriv forklaringer til eieren på vanlig norsk, uten faguttrykk.

## Hva som er bestemt
- Kun Macks egne julebrus er med: Mack God og Lett Julebrus (0,5 l og boks) og Trio Jule-Brus vanlig og Light (0,5 l og 1,5 l). Bildene ligger i `img/` og er klippet ut fra Macks produktbilder.
- **Ingen premier, ingen konkurranse og ingen innsamling av e-post** (bevisst valgt 2026-11-20 for å slippe GDPR og konkurranseregler). Ikke legg dette til uten at eieren ber om det.
- Topp 10-liste med valgfritt kallenavn. Navn som ikke fylles ut vises som «Anonym nisse». Et filter mot stygge ord ligger i `server/lib/navnefilter.js`.
- Butikkartet (Power BI) er fjernet fra spillet 2026-11-20 fordi eieren har lagt det rett over spillet på mack.no/julespill. Ikke legg det tilbake uten at han ber om det.
- Spillet er bygget inn på https://mack.no/julespill/ med iframe. Det må fungere i lave vinduer (ned til ca. 480 px), så test mobil i 390×540 i tillegg til 390×780.
- Spillet må ikke ligne «Brusregn» på juletid.no, der man fanger brus som faller.

## Drift (fra 2026-11-20)
- Spillet har **erstattet FLIBBER** på https://flibber.no etter eierens ønske. Den gamle FLIBBER-koden ligger i git-historikken (commit eb765e1 og eldre).
- Nettsiden: GitHub Pages fra repoets rot (`index.html`, `game.js`, `style.css`, `img/`) med domene fra `CNAME`.
- Topplisten: Railway-tjenesten «flibber» med Root Directory `server/`. Den publiseres automatisk ved `git push`. Adressen er https://flibber-production.up.railway.app, og volumet er montert på `/data` (`DB_PATH=/data/highscore.db`, men den nye databasen heter `/data/toppliste.db`).
- `API` øverst i `game.js` peker på Railway, unntatt når spillet kjører på localhost.
- Nettsider som får bruke topplisten (CORS-listen) står i `TILLATTE_OPPRINNELSER` i `server/server.js`. Hvis spillet skal flyttes til et Mack-domene, må domenet legges til der.

## Teknisk
- `server/server.js` bruker kun Node 24 og det som følger med (`node:sqlite`), uten npm-pakker. PC-en har AppLocker, så unngå pakker med egne programfiler.
- Start lokalt med `cd server && npm start` (http://localhost:5180). Kjør testene med `cd server && npm test`.
- Miljøvariabler i drift:
  - `PORT`
  - `DATA_DIR` (mappe for `toppliste.db`, må ligge på et varig lagringsvolum)
  - `SPILL_HEMMELIGHET` (valgfri; hvis den mangler, lages den automatisk og lagres i databasen)
- Juksevern: Serveren gir en signert «billett» når en runde starter. Poengsummen må være realistisk ut fra hvor lenge runden varte (maks 2,5 poeng per sekund, og runden kan vare maks 30 minutter), og hver billett kan bare brukes én gang. Det finnes også en grense for antall forsøk per IP-adresse.
- `window.__pipeslipp` gir automatiske tester tilgang til hvordan spillet står. Testroboten bruker den til å spille perfekt.

## Designarbeidsflyt
- Bruk `frontend-design`-skillen ved større endringer i utseendet, hvis den er tilgjengelig. Si fra hvis den mangler.
- Designretningen er en nordnorsk julenatt:
  - Farger: polarnatt-blått, nordlys-grønt, Mack-rødt og gull.
  - Skrift: Alfa Slab One til overskrifter og poeng (som JULEBRUS-skriften på etiketten) og Figtree til vanlig tekst.
  - Spillets «wow»-øyeblikk er at vinduene tennes når huset får brus.
- Ta med alle tilstander: lasting, tom liste, feil (topplisten er nede, men spillet virker likevel) og tilbakemelding når noe er gjort.
- Ved større endringer i utseendet: test i Playwright på både mobil (390×780) og PC (1366×768), se på skjermbildene og rett opp feil før du sier at noe er ferdig.
- Skill tydelig mellom hva som er bygget og hva som faktisk er testet når du rapporterer.
