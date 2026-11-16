# Entscheidungen und Plan

Stand: 16.11.2026. Vier offene Fragen, jeweils mit Empfehlung und Begründung. Quellen siehe [recherche.md](recherche.md).

## 1. Nur Deutsch oder Deutsch + Englisch?

**Empfehlung: Deutsch zuerst, Englisch als zweites Sprachpaket gleich mit einplanen.**

- Der Zeichensatz von Deutsch ist eine Obermenge von Englisch (plus ä ö ü ß, „ “, €). Wer Deutsch kann, kann Englisch schreiben.
- Sprache steckt nur in wenigen, klar trennbaren Teilen. Die Engine selbst bleibt sprachneutral (Unicode):

| Teil | `de` | `en` |
|---|---|---|
| Sätze für die Schreibprobe | nach deutscher Buchstaben-/Paarhäufigkeit gewählt | nach englischer |
| Silbentrennung | Liang-Muster `de-1996` | `en-us` |
| Anführungszeichen, Zahlen | „…“ ‚…‘, Dezimalkomma | “…” ‘…’, Dezimalpunkt |
| Wichtige Buchstabenpaare | er, en, ch, de, ei, nd, te, in, ie, ge, sch, ck, tz | th, he, in, er, an, re, … |

- Aufwand für Englisch danach: eine Konfigurationsdatei + englische Probesätze. Lohnt sich für ein öffentliches Repo.

## 2. CLI, MCP-Server oder Skill?

**Entscheidung (16.11.2026): Kern + CLI als Basis, darauf MCP-Server und Agent Skill. Beide müssen *alles* können.**

Begründung:

- **Das Aussehen hängt nicht davon ab.** CLI, MCP und Skill rufen dieselbe Engine auf; die Qualität kommt nur aus Proben + Engine.
- **CLI = am unabhängigsten:** funktioniert ganz ohne KI, für Menschen und Skripte.
- **MCP = offen für viele KI-Programme:** offenes Protokoll, nutzbar u. a. in Claude, ChatGPT, Cursor, VS Code/Copilot, Zed.
  Der Server führt den Code selbst aus, funktioniert also auch in Chat-Apps ohne Terminal.
- **Skill = der komplette Ablauf:** Agent Skills sind seit Dez. 2025 ebenfalls ein offener Standard (agentskills.io; u. a. Codex,
  Copilot, Cursor, Gemini CLI); sie brauchen eine KI, die Befehle auf dem Rechner ausführen darf. Der Skill führt eine KI durch den
  *ganzen* Prozess – von der ersten Schreibprobe bis zum fertigen PDF – und nutzt für jeden Schritt das CLI.
- Alles in **einem npm-Paket** (`penclone`): `npx penclone render …` und `npx penclone mcp`. Keine doppelte Logik.
- Schriftdaten sind **nie** Teil des Pakets oder Repos; Pfad über `PENCLONE_GLYPHS` oder `~/.config/penclone/glyphs.json`.

Geplanter Aufruf (Optionen auf Englisch, weil das Repo englisch ist):

```
penclone render zettel.md --profile ich --output paper --pen ballpoint --color blue --paper squared --grid 5mm -o zettel.pdf
penclone render zettel.md --profile ich --output paper --pen pencil --paper lined --line-spacing 8mm -o zettel.pdf
penclone render zettel.md --profile ich --output ipad --paper dotted --format xopp -o zettel.xopp
penclone mcp        # startet den MCP-Server (stdio)
```

### Regel: alles überall

Jede Fähigkeit steckt im Kern und bekommt **sofort beim Bauen einen CLI-Befehl**. MCP-Werkzeuge und Skill sind dünne Schichten
darüber; nichts geht nur in einer Oberfläche und in der anderen nicht.

| Schritt | CLI | MCP-Werkzeug | Skill |
|---|---|---|---|
| Handschrift-Profil anlegen / auflisten / anzeigen (**fertig:** `pipeline/profiles.py`) | `penclone profile create NAME --pdf …` | `create_profile`, `list_profiles` | ✓ |
| Profil sichern oder umziehen (**fertig**) | `penclone profile export NAME datei.zip` / `import` | `export_profile` | ✓ |
| Probeblatt zum Beschreiben erzeugen (PDF / iPad-Vorlage) | `penclone sample-sheet --lang de` | `create_sample_sheet` | ✓ erklärt, wie man es schreibt |
| Proben am iPad aufnehmen (Zeit, Druck, Neigung) | `penclone capture` (startet die Aufnahmeseite) | `start_capture` | ✓ |
| Proben importieren (iPad-PDF oder Aufnahmedaten) | `penclone import samples.pdf` | `import_samples` | ✓ |
| Glyphen-Bibliothek bauen | `penclone build` | `build_glyphs` | ✓ |
| Qualitätsbericht, Kontaktbogen | `penclone report --sheet` | `glyph_report` (mit Bild) | ✓ deutet den Bericht, schlägt Korrekturen vor |
| Optionale persönliche Ausnahme (**fertig**, normalerweise unnötig) | `penclone override NAME …`, `penclone block NAME k alphabet-v1:p3` | `set_override` | ✓ fragt nach dem Grund, protokolliert ihn |
| Text/Markdown schreiben | `penclone render zettel.md --output paper\|ipad --pen … --paper … --format …` | `render_handwriting` (Pfad + Vorschau) | ✓ |
| Auf Seitenzahl / Schriftgröße einpassen | `penclone render --pages 10` | Option von `render_handwriting` | ✓ |
| Papier, Stifte, Farben, Sprachen auflisten | `penclone styles` | `list_styles` | ✓ |
| Schreibbare Felder auf Scan/PDF vorschlagen (optionale Hilfe) | `penclone detect-fields blatt.pdf` | `detect_fields` (mit nummerierter Vorschau) | ✓ |
| Text in Felder eines Scans/PDFs schreiben, an den Platz angepasst | `penclone fill blatt.pdf --fields felder.json` | `fill_page` (mit Passt-Bericht) | ✓ |
| Lesbarkeit prüfen (OCR-Fehlerrate) | `penclone check zettel.pdf` | `check_legibility` | ✓ |
| Handschrift-Schriftart exportieren (OpenType) | `penclone font` | `export_font` | ✓ |

Der Skill liegt in `skill/penclone/` (`SKILL.md` + `references/` für Optionen und die Anleitung zum Probeschreiben). Er enthält nie
Schriftdaten.

### Nicht-Ziel

penclone soll natürlich aussehen, ist aber **kein** Werkzeug, um Echtheitsprüfungen zu umgehen. Es gibt keine Funktionen, die
gezielt KI-Erkenner, Schriftgutachten oder physische Prüfungen täuschen sollen.

## 3. Papier und Stift einstellbar

**Empfehlung: zwei unabhängige Ebenen – Papier (Hintergrund + wo die Grundlinie liegt) und Stift (wie der Strich aussieht).**

### Papier

| Option | Aussehen | Wirkung auf die Schrift |
|---|---|---|
| `blank` (blanko) | weiß/leicht cremefarben | Zeilen dürfen stärker driften und leicht schräg laufen (Zeilenmodell) |
| `lined` (liniert) | Linien, Abstand einstellbar (Lineatur 27 hat laut Händlerangabe 9 mm), optional Rand | Grundlinie wird zur Linie hingezogen (Kalman-Modell wie bei Haines), Drift kleiner |
| `squared` (kariert) | 5 mm (Lineatur 22 ohne, 26 mit Rand) | Grundlinie auf Kästchenlinie; Schriftgröße so, dass die x-Höhe ein festes Verhältnis zum Kästchen hat (Parameter) |
| `dotted` (punktiert) | Punktraster 5 mm | wie kariert, nur dezenter |

Zusätzlich optional: Scan-Look (leichte Papierfarbe, minimale Schräglage der ganzen Seite, Schatten am Rand) vs. sauberer Druck.

### Stift

| Stift | Strich | Umsetzung |
|---|---|---|
| `ballpoint` (Kuli) | fast konstante Breite (±5 %), blau oder schwarz; dunkler in langsamen Stellen (Kurven, Strichanfang, kleiner Tintenpunkt), heller/dünner in schnellen geraden Strichen, feine Aussetzer | Geschwindigkeit aus Krümmung schätzen (Zwei-Drittel-Gesetz) bzw. aus Zeitstempeln, Tintenmodell nach Franke & Rose |
| `pencil` (Bleistift) | grau, weiche Kante, Körnung des Papiers sichtbar, Druck → Dunkelheit | Graustufe × Papierkorn-Rauschen (SVG `feTurbulence`) × Druck (Sousa & Buchanan) |
| `fineliner` / `gel` | satte Farbe, konstante Breite, keine Textur | einfachste Variante |
| `highlighter` (Textmarker) | breit, halbtransparent, multiplizierend, schräge Enden | für Hervorhebungen statt CSS-Rechteck |

Fett = **Nachziehen** (zweiter Strich leicht versetzt), nicht dickere Linie.

## 4. iPad: „digital in eigener Handschrift“

Zwei Dinge, die beide Sinn ergeben:

**a) iPad-Look als Stil** (`--style ipad`): perfekte Vektorlinien, Breite aus simuliertem Druck (wie
[perfect-freehand](https://github.com/steveruizok/perfect-freehand)), reine Farben, Vorlagen wie in Notiz-Apps (liniert, kariert,
punktiert). Ergebnis als PDF, das man in GoodNotes/Notability importieren kann.

**b) iPad als Aufnahmegerät für bessere Schreibproben** – der größere Gewinn:
eine kleine Webseite, die am iPad in Safari läuft, zeigt den Probesatz an und zeichnet jeden Strich mit **Zeit, Druck und Neigung**
auf (Pointer Events mit dem Apple Pencil). Vorteile gegenüber dem PDF-Export:

- Welches Zeichen gerade geschrieben wird, ist bekannt → keine Zeilen-/Zeichen-Heuristik, keine Schwellen pro Seite (C2).
- Zeitstempel → echte Geschwindigkeit → Sigma-Lognormal-Variation (B4) und realistischer Kuli-Strich.
- Druck → echte Strichbreite für den iPad-Look.

**Darum sollte die Engine in JavaScript/TypeScript bleiben** (ohne DOM-Abhängigkeit): Dieselbe Engine läuft dann im Browser am iPad,
im CLI (Node) und in bestehenden HTML-Seiten. Python bleibt für Auswertung und Glyphen-Bau.

## 5. Belege statt Raten

Jede Funktion und jeder Standardwert kommt aus einer von drei Quellen, und die Doku sagt, aus welcher:

1. **zitierte Quelle** – Paper, Standard oder Spezifikation ([recherche.md](recherche.md));
2. **Messung an deinen eigenen Proben** – z. B. deine Buchstabenproportionen oder deine Schriftgröße im Verhältnis zur Linie;
3. sonst wird der Wert in Doku und Konfiguration als **Annahme** markiert, damit er später geprüft werden kann (P4: messen).

Die README listet die Fakten hinter jeder Funktion.

## 6. Profile: deine Handschrift unter einem Namen gespeichert (fertig)

Ein Profil enthält alles, was penclone über eine Handschrift weiß – **außerhalb des Repos**, damit es Updates und neues
Herunterladen übersteht: `~/.local/share/penclone/profiles/<name>/` (oder `$PENCLONE_HOME`).

| Datei | Inhalt |
|---|---|
| `profile.json` | Name, Sprachen, Proben, optionale **Ausnahmen** und ein **Protokoll** aller Änderungen mit Datum und Grund |
| `samples/<quelle>/` | deine Proben-PDF und die daraus gelesenen Seiten |
| `glyphs.json` | die Glyphen-Bibliothek aus den Proben mit den allgemeinen Regeln |

**Wie penclone „lernt“.** Es wird kein neuronales Netz trainiert (warum: [recherche.md §9](recherche.md#9-neuronale-verfahren--warum-noch-nicht)).
Es wird auf zwei Wegen besser:

1. **Mehr Proben** (im Profil) → mehr Varianten pro Zeichen, genauer gemessene Proportionen und Abstände.
2. **Allgemeine Regeln** (in der Pipeline, für alle gleich, siehe [regeln.md](regeln.md)) → z. B. Zeichen bleiben wie geschrieben,
   Umlaute bekommen die Größe ihrer Grundbuchstaben, verwechselbare Varianten (ein k, das wie h aussieht) werden übersprungen.
   Nutzer können sie nicht ändern; sie ändern sich nur über geprüfte Pull Requests.

Persönliche **Ausnahmen** (`overrides`) gibt es nur als letzten Ausweg für Fälle, die die Regeln nicht abdecken. Sie sind normalerweise
leer und werden mit Grund protokolliert; braucht man eine, fehlt meist eine allgemeine Regel.

Profile lassen sich als Zip exportieren (Sicherung, anderer Rechner) und wieder importieren. Sie kommen nie ins Repo.

## 7. penclone deine Schrift beibringen: vorgegebene Sätze

**Entscheidung: vorgegebene Sätze schreiben – kein freier Text, keine Alphabet-Reihen.**

- Bei **vorgegebenen Sätzen** weiß penclone genau, zu welchem Buchstaben jeder Strich gehört. Die Sätze werden so gewählt, dass
  Buchstaben, Großbuchstaben, Umlaute, ß, Ziffern, Satzzeichen und häufige Buchstabenpaare mehrfach vorkommen (Haines et al.).
- **Alphabet-Reihen** (Probe v1) sehen ordentlicher aus als echtes Schreiben und verstecken das Größenverhältnis zwischen den
  Reihen – die Ursache von A3–A5 in [bekannte-probleme.md](bekannte-probleme.md).
- **Freier Text** („einfach meine Notizen reinwerfen“) geht nur, wenn penclone auch den getippten Text dazu bekommt (Transkript);
  sonst müsste jeder Buchstabe erst erkannt werden, was Fehler einbringt. Später geplant als „Import mit Transkript“.

Probeblatt v2 (geplant):

| Punkt | Inhalt | Grundlage |
|---|---|---|
| Papier | liniert, in deinem üblichen Zeilenabstand | misst deine Schriftgröße *im Verhältnis zur Linie* (Beleg-Art 2) |
| Text | deutsche Pangramme + Sätze, automatisch nach Abdeckung gewählt; optional Sätze aus deinem Zieltext (z. B. Lernzettel) | Haines: Probetext nach Buchstaben- und Paarhäufigkeit eines Zieltexts |
| Abdeckung | häufige Kleinbuchstaben je 6–8×, Großbuchstaben und Umlaute mehrfach, häufige Paare (er, en, ch, sch, ck, ei, ie, …) | Haines: Ersatz erst unter 8 exakten Treffern |
| Umfang | 2–4 Seiten, 10–30 Minuten | Haines: ca. 4 A4-Seiten, 10–30 min |
| Wie schreiben | normal, normales Tempo, mit dem Stift, der nachgeahmt werden soll | ungewohntes/langsames Schreiben verändert die Schrift (Haines) |
| Aufnahme | iPad-Aufnahmeseite (Zeit, Druck, Neigung) oder PDF-Export aus deiner Notiz-App | Zeitdaten ermöglichen Bewegungs-Variation (Martín-Albo et al.) |

## 8. Ausgabe: Papier oder iPad, alles einstellbar

**Entscheidung: ein Satz Optionen; jeder Standardwert ist belegt, an deinen Proben gemessen oder als Annahme markiert.**

| Option | Werte | Standardwert kommt aus |
|---|---|---|
| `--output` | `paper` (Stift auf Papier simuliert, zum Drucken oder als Scan-Look) · `ipad` (saubere digitale Tinte wie in Notiz-Apps) | – |
| `--pen` | Papier: `ballpoint`, `pencil`, `fineliner`, `gel`, `fountain`, `highlighter` · iPad: `pen`, `pencil`, `highlighter` | Stiftmodelle: Franke & Rose (Kuli), Sousa & Buchanan (Bleistift); iPad-Breite: perfect-freehand |
| `--color`, `--width` | beliebige Farbe; Strichbreite in mm | Annahme, bis an Scans gemessen |
| `--paper` | `blank`, `lined`, `squared`, `dotted`, Vorlagen `lin22`, `lin26`, `lin27`, `lin28` oder ein Scan/PDF als Hintergrund | deutsche Lineaturen (Händlerangaben; lin27-Abstand nur aus einer Quelle) |
| `--line-spacing`, `--grid`, `--margin` | mm | aus der Papiervorlage |
| `--page` | `a4`, `a5`, `letter` oder `BxH` mm | – |
| `--size` | x-Höhe in mm oder `auto` | `auto` = dein eigenes Verhältnis x-Höhe : Zeilenabstand, gemessen auf Probeblatt v2 |
| `--pages` | Text auf N Seiten einpassen | – |
| `--format` | `pdf`, `svg`, `png`, `xopp`, `excalidraw`, `inkml` | siehe unten |

### Bearbeitbar auf dem iPad (GoodNotes)?

Fakten: GoodNotes speichert in einem **nicht dokumentierten Format**; Nutzer fordern ein offenes Format, Versuche es nachzubauen sind
unvollständig ([recherche.md §11](recherche.md#11-bearbeitbare-digitale-tinte)). penclone kann deshalb **keine bearbeitbare
GoodNotes-Tinte** erzeugen. Was geht:

| Ziel | Striche bearbeitbar? | Wie |
|---|---|---|
| GoodNotes, Notability | nein – Schrift ist Seitenhintergrund oder Bild | PDF importieren und darüber schreiben; oder PNG-Zeilen, die man mit dem Lasso verschieben/skalieren kann |
| Xournal++ (`.xopp`) | **ja** | offenes Format: gzip-komprimiertes XML wie Xournal `.xoj` |
| Excalidraw (`.excalidraw`, läuft in Safari am iPad) | **ja** (Freihand-Striche) | offenes JSON-Format |
| OneNote | **ja**, über InkML (Microsoft-Ink-API, Beta 2017 – zu prüfen) | InkML |
| jedes Programm, das InkML liest | **ja** | InkML ist eine W3C-Empfehlung (2011) zum Austausch digitaler Tinte |

## 9. Eingescannte Seiten und Arbeitsblätter: die KI sagt was wohin, penclone passt es ein

**Entscheidung: Die KI (oder ein Mensch) entscheidet, *was* *wohin* kommt, und gibt einen groben Kasten an. penclone misst den Platz
und passt den Text ein. Ein eigener Erkennungsschritt ist nicht nötig.**

1. Die KI schaut die Seite an und gibt eine Feldliste zurück: pro Antwort einen groben Kasten und den Text.
2. `penclone fill` schreibt jeden Text in seinen Kasten und **passt ihn ein**: Zeilenumbruch mit Silbentrennung; Größe so nah an
   deiner natürlichen Schriftgröße wie möglich, kleiner wenn nötig, aber nie unter einer Mindestgröße, die noch lesbar ist. Passt
   ein Text trotzdem nicht, **meldet penclone, wie viel fehlt**, statt ihn unlesbar klein zu machen – dann kann die KI kürzen oder
   einen größeren Kasten wählen.
3. penclone **richtet sich an der Seite aus**: Sind im Kasten Linien, steht die Schrift darauf (Linienerkennung im Kasten, z. B.
   Hough-Transformation, Duda & Hart, CACM 1972). Der Kasten der KI darf also grob sein.
4. penclone gibt Ergebnis, Vorschaubild und einen Passt-Bericht pro Feld zurück; die KI prüft die Vorschau und korrigiert bei Bedarf.

Warum penclone den Platz misst und nicht die KI:

- Nur penclone weiß, wie viel Platz *deine* Handschrift braucht (Glyphenbreiten, Abstände und Zeilenhöhe aus deinem Profil).
- Bild-Sprach-Modelle verstehen Seiteninhalte gut, sind bei genauer Geometrie aber unzuverlässiger: In „Vision language models are
  blind“ (Rahmanzadehgervi et al., ACCV 2024) lösten vier Modelle von 2024 einfache Geometrie-Aufgaben wie „kreuzen sich zwei
  Linien?“ im Schnitt zu 56 % (bestes: 74 %). Also gibt die KI grobe Kästen, penclone macht die genaue Geometrie.
- penclone bleibt vorhersagbar und prüfbar und funktioniert auch ohne KI (Feldliste von Hand).

Optionale Hilfe: `penclone detect-fields` listet mögliche Linien und Kästen mit Nummern und Vorschaubild auf – praktisch ohne KI,
oder wenn die KI lieber nummerierte Felder auswählt statt Koordinaten anzugeben.

Feldliste (Kasten in mm ab der linken oberen Ecke; `size` und `min_size` sind optional):

```json
{"page": 1, "unit": "mm", "fields": [
  {"box": [25, 80, 160, 12], "text": "Vertraulichkeit, Integrität, Verfügbarkeit"}
]}
```

```
penclone fill blatt.pdf --fields felder.json --profile ich --pen ballpoint -o ausgefuellt.pdf   # passt ein, meldet Überlauf
penclone detect-fields blatt.pdf -o felder.json --preview felder.png                           # optionale Hilfe
```

MCP-Werkzeuge: `fill_page` (PDF, Vorschau und Passt-Bericht pro Feld: verwendete Größe, Überlauf), `detect_fields` (optional). Der
Skill beschreibt den Ablauf: Seite ansehen → Feldliste schreiben → ausfüllen → Vorschau und Bericht prüfen → nachbessern.

Auch dein eigenes Papier geht als Vorlage: `--paper mein_papier_scan.pdf` nimmt jeden Scan oder jedes PDF als Seitenhintergrund.

## 10. Deine Daten bleiben lokal

- Profile (Proben, Ausnahmen, Glyphen) liegen in `~/.local/share/penclone/profiles/` – oder, wenn du alles im Tool-Ordner haben willst,
  mit `PENCLONE_HOME=./data`. `data/`, `profiles/`, `samples/`, `scans/`, `*.zip`, `*.pdf`, `*.svg` und Glyphen-Dateien werden von Git
  ignoriert.
- Die CI lehnt jeden Commit ab, der solche Dateien enthält („No handwriting data in the repository“).
- penclone lädt nichts hoch. Nur was ein KI-Programm selbst verschickt (z. B. ein Vorschaubild, das du es ansehen lässt), verlässt
  deinen Rechner.

## Zielarchitektur

```
Schreibprobe ─┬─ iPad-Webaufnahme (Striche + Zeit + Druck, Zeichen bekannt)
              └─ PDF-Export (nur Form, heutiger Weg)
                    │
              pipeline/ (Python) ──► Glyphen-Bibliothek (JSON, lokal, privat)
                                            │
engine/ (JS/TS, ohne DOM):
  Text ─► Layout (Zeilenumbruch + Silbentrennung) ─► Schreiber-Modell (Glyphenwahl, Abstände, Grundlinie)
       ─► Stift-Renderer (ballpoint | pencil | fineliner | ipad) ─► Papier (blank | lined | squared | dotted) ─► SVG/PDF
                                            │
Profile (~/.local/share/penclone/profiles/<name>: Proben, Ausnahmen + Protokoll, Glyphen)  ◄── von jeder Oberfläche gelesen

     CLI (Node) ◄─┬─ MCP-Server   (dieselben Befehle, voller Umfang)        Web/PWA (iPad)
                  └─ Skill        (SKILL.md, ganzer Ablauf)

Ausgaben: pdf · svg · png · xopp · excalidraw · inkml
```

## Fahrplan

| Schritt | Inhalt | Ergebnis |
|---|---|---|
| **P0** ✓ | Glyphen-Fehler A1, A2, A4, A6, A7 ([bekannte-probleme.md](bekannte-probleme.md)) als allgemeine Regeln R1–R5; automatische Zeilenerkennung | erledigt |
| P1 | Probe v2: deutsche Sätze (Pangramm + häufige Paare), Groß/klein gemischt, Positionen; iPad-Webaufnahme | 6–8 Varianten, richtige Proportionen |
| P2 | Engine ohne DOM: Layout + Silbentrennung, Zeilenmodell, Seeds pro Stelle, ein Pfad pro Zeile | kleinere PDFs, stabile Ausgabe |
| P3 | Papier + Stifte + iPad-Stil; CLI, MCP-Server und Skill mit vollem Funktionsumfang | jeder Schritt per CLI, MCP oder Skill nutzbar |
| P4 | Messen: OCR-Fehlerrate (deutsches TrOCR), HWD, Blindtest | Parameter begründet |
| später | Englisch-Paket, OpenType-Export | – |
