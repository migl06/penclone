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
3. ~~**Keine Zeilenebene.**~~ – **behoben** (P2): Jede Zeile bekommt eine langsame Drift der Grundlinie, die zur Linie zurückkehrt
   (Ornstein-Uhlenbeck-Prozess), eine kleine Schräge und einen leicht schwankenden Anfang; Wortabstände schwanken. All das ist
   **aus dem eigenen Probeblatt v2 gemessen** (`pipeline/measure_layout.py` → `layout.json` im Profil), siehe
   [recherche.md §13](recherche.md#13-zeilen-gewohnheiten-aus-der-eigenen-probe-gemessen).
4. **Verformung ohne motorische Grundlage.** Zwei Sinuswellen verbiegen alle Striche eines Zeichens gleich. Die Forschung variiert
   die Bewegung (Sigma-Lognormal, ±15 % auf µ und σ) – dafür braucht es Zeitstempel, die PDF-Exporte nicht haben.
5. **Strichbild wirkt digital** – *teilweise behoben* (P3): Stifte legen Farbe, Breite und Deckkraft fest; der iPad-Look ändert die
   Breite entlang des Strichs (simulierter Druck, spitze Enden); Bleistift-Körnung im SVG. Noch offen: Tintenmodell für Kulis
   (dunkler wo langsam), Bleistift-Körnung im PDF, fett als Nachziehen.
6. **Textmarker** – in der neuen Engine noch nicht gebaut.

## C. Technik

1. ~~Seiten-spezifische Zeilen-Schwellen und ein Sonderfall für vertauschte Zeilen~~ – **behoben**: Zeilen und ihre Reihenfolge
   werden automatisch erkannt (`pipeline/rows.py`).
2. ~~**Der Renderer hängt an einer HTML-Seite.**~~ – **behoben** (P2): `engine/` setzt Text selbst und schreibt SVG und PDF, in Node
   und im Browser, ohne DOM und ohne Abhängigkeiten (`penclone render`). Der alte eingefügte Renderer `engine/handwriting.js` bleibt
   nur für bestehende HTML-Seiten.
3. ~~**Ein `<span>` + ein `<svg>` pro Zeichen**~~ – **behoben** (P2): ein Pfad pro Zeile und Strichbreite; Striche auf 0,02 mm
   vereinfacht und als gerade Segmente geschrieben. Testseite mit 14 Zeilen: 55 KB PDF (vorher mehrere MB pro Seite).
4. ~~**Keine Silbentrennung.**~~ – **behoben** (P2): Liang-Algorithmus mit den TeX-Mustern `de-1996`. Getrennt wird nur, wenn sonst
   am Zeilenende eine große Lücke bliebe (6 x-Höhen, Annahme) oder das Wort nicht einmal allein in eine Zeile passt.
5. ~~**Ein globaler Zufallsstrom.**~~ – **behoben** (P2): Jede Entscheidung hat einen eigenen Strom, benannt nach dem, was sie
   entscheidet (Wort und wievieltes Vorkommen, Zeile); ein geändertes Wort lässt die anderen Zeilen gleich (getestet).
6. **Fehlende Zeichen** – *teilweise behoben* (P2): typografische Doppelgänger (’ → ', — → –) und der Grundbuchstabe bei Akzenten
   (é → e) werden benutzt und gemeldet; alles andere wird weggelassen und gemeldet, statt auf eine Schriftart zurückzufallen.
   Die KI fragt, ob du sie auf einem kleinen Zeichenblatt schreiben (`penclone sample-sheet --chars`), weglassen oder ersetzen
   willst (P3). Noch offen: neue Zeichen aus vorhandenen Strichen zusammensetzen.
7. **Noch keine Messung.** Parameter nach Augenmaß; geplant: OCR-Zeichenfehlerrate (Lesbarkeit) und HWD (Stil-Ähnlichkeit),
   siehe [recherche.md](recherche.md#8-messen-statt-raten).

## Fahrplan

| Schritt | Was | Ergebnis |
|---|---|---|
| **P0** ✓ | A1, A2, A4, A6, A7 als allgemeine Regeln R1–R5; automatische Zeilenerkennung | erledigt |
| P1 | Probeblatt v2: vorgegebene deutsche Sätze, Groß/klein gemischt, Wortpositionen; iPad-Aufnahmeseite | behebt A3, A5, A8, B1, B2 an der Wurzel. **Bisher fertig:** Blatt-Generator, Import und Glyphen-Bau (`make_sheet.py`, `segment_v2.py`, `build_glyphs_v2.py`), getestet mit synthetischer Handschrift; **an einem echten Blatt getestet:** mit einer ersten Glyphenbibliothek als Vorlage (`--templates`) 159 von 335 Wörtern zugeordnet, Kleinbuchstaben meist sauber, i/Ä/ß noch schwach, Laufzeit ca. 100 s; **Profil-Anbindung fertig** (`profiles.py add-sample`, `build` erzeugt `glyphs-v2.json` neben den v1-Glyphen; die neue Engine nutzt sie mit `--glyph-set v2|both`, Standard bleibt v1, bis v2 sauberer ist); **iPad-Aufnahmeseite fertig** (`penclone capture`); **offen:** Regeln R3/R5 für v2, i-Punkt, Geschwindigkeit, Zeit und Druck nutzen |
| **P2** ✓ | Engine ohne DOM: eigenes Layout + Silbentrennung, Zeilenmodell aus der Probe gemessen, Seeds pro Stelle, ein Pfad pro Zeile; `penclone render` | C2–C5, B3 behoben, C6 teilweise |
| **P3** ✓ | Papier (eingebaut + eigene Scans), Stifte, iPad-Ausgabe; CLI, MCP-Server und Skill; Arbeitsblätter ausfüllen; Zeichenblätter | [entscheidungen.md §14](entscheidungen.md#14-papier-stifte-arbeitsblätter-mcp-server-und-skill-p3); offen: detect-fields, `--pages`, Textmarker, Tintenmodell |
| P4 | Messen: OCR-Fehlerrate, HWD, Blindtest | Parameter begründen, R5 bestätigen |
| P5 | **Allgemeine Regeln mit anderen Schreibern prüfen**, datensparsam: `penclone validate` berechnet nur anonyme Statistiken (keine Striche, keine Bilder), die Freiwillige in einem Issue posten | Werkzeug + Issue-Formular fertig; Antworten sammeln offen |
| P6 | **Paket und Anleitung**: ein npm-Paket (CLI + MCP-Server; Pipeline nach TypeScript portiert oder per pipx mitgeliefert, damit niemand Python von Hand einrichten muss) + Endnutzer-Anleitung (DE/EN) | Anleitung fertig; Installation von GitHub; offen: npm-Veröffentlichung, Python ohne Handarbeit |
