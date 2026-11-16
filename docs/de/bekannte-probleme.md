# Bekannte Probleme

Stand: 16.11.2026. Gefunden beim Aufbau der ersten Glyphen-Bibliothek mit Probeblatt v1 und beim Rendern ganzer Seiten damit.
English version: [../known-issues.md](../known-issues.md).

## A. Glyphen-Bibliothek (Probeblatt v1)

| # | Problem | Ursache | Stand |
|---|---|---|---|
| A1 | Kleine Zeichen (Doppelpunkt, i-Punkte) wurden nur teilweise durch künstliche Punkte ersetzt – Mischformen, z. B. ein Doppelpunkt, der wie „°“ aussieht. | Ersetzung nur unter einer festen Größe (0,14 em). | **behoben** – Regel R1 ([regeln.md](regeln.md)) |
| A2 | Ein Großbuchstabe, dessen erster Strich unter die Grundlinie reicht, liest sich als anderer Buchstabe (z. B. N als „V“); ! und ? standen unterschiedlich hoch. | Grundlinie aus dem 97. Perzentil der Zeile. | **behoben** – R3, R4 |
| A3 | Großbuchstaben kaum höher als Oberlängen, dadurch sind K/k und I/l schwer zu unterscheiden. | Groß- und Kleinbuchstaben stehen in getrennten Zeilen; ihr Größenverhältnis lässt sich nicht messen. | offen – Probeblatt v2 |
| A4 | Kleine Umlaute werden deutlich größer als ihre Grundbuchstaben und lesen sich wie Großbuchstaben. | Die Umlaut-Zeile wird nur über die Seiten angeglichen, nicht an die x-Höhe. | **behoben** – R2 |
| A5 | Einzelne Buchstaben können kleiner als die x-Höhe werden. | Gleiche Ursache wie A3. | offen – Probeblatt v2 |
| A6 | Eine Variante kann wie ein anderer Buchstabe aussehen (z. B. ein k mit Schleife wie h). | – | **behoben** – R5 (Schwellen noch Annahme) |
| A7 | Winzige Ansetz-Striche wurden zu sichtbaren Punkten. | Punkt-Ersetzung für jeden kleinen Strich. | **behoben** – R1 |
| A8 | Unruhige Abstände im Wort. | Abstand nach engster Tintenstelle; das Auge bewertet die weiße *Fläche* zwischen Buchstaben. | offen – flächenbasierte Abstände (HT Letterspacer) |

## B. Natürlichkeit

1. **Wenige Varianten pro Zeichen** (3 bei Probeblatt v1). Bei häufigen Buchstaben fällt Wiederholung auf. Haines et al. erlauben
   Ersatz erst unter 8 exakten Treffern → Ziel 6–8 Varianten für häufige Zeichen.
2. **Varianten aus Alphabet-Reihen statt aus Wörtern.** In Reihen schreibt man ordentlicher als in Wörtern, und Anfangs- und
   Endbuchstaben schreibt man anders (Srihari et al. 2002, bei Haines zitiert). Glyphen haben noch keine Wortposition.
3. **Keine Zeilenebene.** Zeilen sind exakt gerade und links bündig; echte Schrift driftet und kommt zurück (Haines:
   Kalman-Glättung). Der Zufallslauf der Grundlinie startet außerdem bei jedem Textknoten neu.
4. **Verformung ohne motorische Grundlage.** Zwei Sinuswellen verbiegen alle Striche eines Zeichens gleich. Die Forschung variiert
   die Bewegung (Sigma-Lognormal, ±15 % auf µ und σ) – dafür braucht es Zeitstempel, die PDF-Exporte nicht haben.
5. **Strichbild wirkt digital.** Konstante Breite; Deckkraft schwankt pro Zeichen statt entlang des Strichs; fett ist eine dickere
   Linie statt Nachziehen.
6. **Textmarker** ist ein Rechteck mit runden Ecken statt eines Markerstrichs.

## C. Technik

1. ~~Seiten-spezifische Zeilen-Schwellen und ein Sonderfall für vertauschte Zeilen~~ – **behoben**: Zeilen und ihre Reihenfolge
   werden automatisch erkannt (`pipeline/rows.py`).
2. **Der Renderer hängt an einer HTML-Seite.** `engine/handwriting.js` wird in eine Seite eingefügt, die Layout und einen
   Zufallsgenerator liefert. Für CLI, MCP-Server und Arbeitsblätter braucht es einen Renderer ohne DOM (SVG/PDF-Ausgabe).
3. **Ein `<span>` + ein `<svg>` pro Zeichen** → tausende DOM-Knoten pro Seite und große PDFs (mehrere MB pro Seite). Das Layout
   braucht eine Überlauf-Toleranz, weil Tinte über die Zeichenbox hinausragt.
4. **Keine Silbentrennung.** Wörter sind unteilbare Blöcke; deutsche Komposita erzeugen Flatterrand oder Überlauf.
5. **Ein globaler Zufallsstrom.** Ein geändertes Wort ändert das Aussehen von allem danach. Besser: Seed pro Stelle.
6. **Fehlende Zeichen** fallen auf eine Schriftart zurück → Stilbruch. Besser: aus vorhandenen Glyphen zusammensetzen.
7. **Noch keine Messung.** Parameter nach Augenmaß; geplant: OCR-Zeichenfehlerrate (Lesbarkeit) und HWD (Stil-Ähnlichkeit),
   siehe [recherche.md](recherche.md#8-messen-statt-raten).

## Fahrplan

| Schritt | Was | Ergebnis |
|---|---|---|
| **P0** ✓ | A1, A2, A4, A6, A7 als allgemeine Regeln R1–R5; automatische Zeilenerkennung | erledigt |
| P1 | Probeblatt v2: vorgegebene deutsche Sätze, Groß/klein gemischt, Wortpositionen; iPad-Aufnahmeseite | behebt A3, A5, A8, B1, B2 an der Wurzel |
| P2 | Engine ohne DOM: eigenes Layout + Silbentrennung, Zeilenmodell, Seeds pro Stelle, ein Pfad pro Zeile | C2–C5, B3 |
| P3 | Papier, Stifte, iPad-Ausgabe; CLI, MCP-Server und Skill; Arbeitsblätter ausfüllen | siehe [entscheidungen.md](entscheidungen.md) |
| P4 | Messen: OCR-Fehlerrate, HWD, Blindtest | Parameter begründen, R5 bestätigen |
