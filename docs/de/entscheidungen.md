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

| Schritt | CLI | MCP-Werkzeug | Stand |
|---|---|---|---|
| Stand und nächsten Schritt sehen | `penclone status`, Assistent `penclone init` | `get_status` | **fertig** |
| Profil anlegen / auflisten | `penclone profile create NAME`, `profile list` | `create_profile`, `list_profiles` | **fertig** |
| Profil sichern oder umziehen | `penclone profile export NAME datei.zip` / `import` | `export_profile`, `import_profile` | **fertig** |
| Probeblatt erzeugen (alle Sätze oder nur fehlende Zeichen) | `penclone sample-sheet [--chars "§@"]` | `create_sample_sheet` | **fertig** |
| Geschriebenes Blatt importieren und bauen | `penclone import NAME blatt.pdf --manifest sheet.json` | `import_samples` | **fertig** |
| Glyphen-Bibliothek neu bauen | `penclone profile build NAME [--only v1\|v2\|chars]` | `build_profile` | **fertig** |
| Qualitätsbericht, Kontaktbogen | `penclone report NAME --sheet bild.png` | `glyph_report` (mit Bild) | **fertig** |
| Voreinstellungen (Ausgabe, Stift, Farbe, Papier, Seite, Sprache, Format) | `penclone prefs NAME key=value` | `set_preferences` | **fertig** |
| Eigene Papiervorlage (Scan oder Parameter) | `penclone template add NAME --from scan.pdf` | `add_template` | **fertig** |
| Text schreiben | `penclone render datei.txt --output paper\|ipad --pen … --paper … -o x.pdf\|svg\|png\|xopp\|inkml\|excalidraw` | `render_handwriting` (Datei + Vorschau) | **fertig** |
| Papier, Stifte, Formate auflisten | `penclone styles` | `list_styles` | **fertig** |
| Text in Felder eines Scans/PDFs schreiben, eingepasst | `penclone fill blatt.pdf --fields felder.json` | `fill_page` (Vorschau + Bericht pro Feld) | **fertig** |
| Anonyme Statistik für die Regel-Prüfung | `penclone validate NAME` | `anonymous_statistics` | **fertig** |
| Optionale persönliche Ausnahme (normalerweise unnötig) | `penclone profile override …`, `profile block …` | – (bewusst nur CLI: soll selten sein) | fertig |
| Proben am iPad aufnehmen (Zeit, Druck, Neigung) | `penclone capture NAME [--chars C]` | `start_capture` | **fertig** (aufgezeichnet; Zeit/Druck nutzt die Engine noch nicht) |
| Felder auf einem Scan vorschlagen (optionale Hilfe) | `penclone detect-fields` | `detect_fields` | geplant |
| Auf Seitenzahl einpassen | `penclone render --pages N` | Option `pages` von `render_handwriting` | **fertig** |
| Lesbarkeit prüfen (OCR) | `penclone check` | `check_legibility` | geplant (P4) |
| Handschrift-Schriftart (OpenType) | `penclone font` | `export_font` | später |

Der Skill liegt in `skill/penclone/` (`SKILL.md` + `references/` für Optionen und die Anleitung zum Probeschreiben). Er enthält nie
Schriftdaten.

### Ziel: so menschlich wie möglich

**Entscheidung: Das Ergebnis soll von der eigenen Handschrift nicht zu unterscheiden sein.** Schwankung kommt aus den gemessenen
Verteilungen der Person, nie aus gleichförmigem Rauschen. Alles Regelmäßige, das beim Lesen auffällt (wiederholte Zeichen,
konstante Abstände, parallele Grundlinien, gleichförmige Striche), gilt als Fehler. Rahmen: die eigene Handschrift aus den eigenen
Proben; keine Unterschriften (eine geplottete Unterschrift ist keine eigenhändige).

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

## 11. Einweisung: penclone kennt den nächsten Schritt, die KI (oder ein Assistent) fragt nur das Nötige

**Entscheidung: Den nächsten Schritt berechnet penclone selbst – die KI rät ihn nicht –, und jede Oberfläche zeigt ihn gleich an.**

- `penclone status` liefert den Stand und den **nächsten Schritt**, z. B. „kein Profil → Probeblatt erzeugen“, „Proben importiert,
  nicht gebaut → bauen“, „Bericht hat Warnungen → ansehen“, „bereit“. Das MCP-Werkzeug `get_status` liefert dasselbe; der Skill sagt
  der KI, es zuerst aufzurufen und ihm zu folgen; der Assistent `penclone init` führt ohne KI durch dieselben Schritte.
- **Nur das Nötige fragen, Standardwerte für den Rest.** Progressive Disclosure – selten gebrauchte Optionen nach hinten
  verschieben – macht Software leichter erlernbar und weniger fehleranfällig (Nielsen 2006, Nielsen Norman Group; die empirische
  Basis gilt als dünn). Beim ersten Start drei Fragen: Sprache, Ausgabe (`paper` / `ipad`), Papier. Stift, Farbe und Größen starten
  mit Standardwerten.
- **Antworten werden gemerkt** als `preferences` im Profil (Standard-Ausgabe, Stift, Farbe, Papier). Das sind die eigenen
  Voreinstellungen des Nutzers und jederzeit änderbar – anders als die allgemeinen Glyphen-Regeln, die Nutzer nicht ändern können.
- **Die KI schlägt vor, der Nutzer entscheidet:** Aus der Aufgabe schlägt die KI Optionen vor (z. B. „Arbeitsblatt → direkt auf den
  Scan schreiben“), zeigt eine Vorschau und fragt, bevor sie Dateien schreibt.
- Erster Start: Profil anlegen → Probeblatt öffnen/drucken → Sätze schreiben (2–4 Seiten) → importieren → bauen und Bericht
  (penclone erklärt Warnungen) → erste Vorschau → fertig.

## 12. Papiervorlagen: eingebaut, eigene, und wie eine gewählt wird

**Entscheidung: Eingebaute Vorlagen werden aus Parametern erzeugt (keine Bilddateien, in jeder Größe exakt); eigene Vorlagen liegen
in deinem Profil; das Papier wird in fester Reihenfolge gewählt.**

Eingebaute Vorlagen (im Repo, für alle gleich; jeder Wert lässt sich überschreiben, z. B. `--line-spacing 8mm --page a5`):

| Name | Art | Abstand | Quelle |
|---|---|---|---|
| `blank` | ohne Linien | – | – |
| `lined-narrow` / `lined-college` / `lined-wide` | liniert | 6,35 / 7,1 / 8,7 mm (1/4, 9/32, 11/32 Zoll) | US-Liniaturen ([Wikipedia](https://en.wikipedia.org/wiki/Ruled_paper) und Händlerangaben) |
| `lin27` | liniert, Doppelrand | 9 mm | Lineatur 27 (eine Händlerquelle) |
| `lin22`, `lin26` | kariert, ohne / mit Rand | 5 mm | Lineatur 22 / 26 |
| `lin28` | kariert, Doppelrand | 5 mm (Annahme) | Lineatur 28 (Abstand nicht gefunden) |
| `dotted` | Punktraster | 5 mm (Annahme) | – |

Eigene Vorlagen (in deinem Profil, nie im Repo):

```
penclone template add mein-block --from leere_seite_scan.pdf    # penclone misst Zeilenabstand, Raster und Ränder automatisch
penclone template add mein-block --type lined --line-spacing 7mm --margin-left 20mm
```

Niemand misst von Hand. Mit `--from` erkennt penclone die Linien (Hough-Transformation) und kann den Scan als Hintergrund behalten –
für echten Papier-Look. penclone misst statt der KI, weil sich kleine Fehler aufaddieren: ein auf 7,0 statt 7,1 mm geschätzter
Abstand liegt in Zeile 30 schon 3 mm neben der Linie, und Bild-Sprach-Modelle sind bei genauer Geometrie unzuverlässig
(Rahmanzadehgervi et al., ACCV 2024). Die Aufgabe der KI ist, zu fragen, welches Papier du willst, und die Auswahl zu zeigen.

Wie das Papier gewählt wird (das erste Zutreffende gilt):

1. ausdrücklich angegeben (`--paper …`, oder was die KI nach Rückfrage übergibt)
2. die Aufgabe: Beim Ausfüllen eines Arbeitsblatts ist der Scan selbst das Papier
3. deine Profil-Voreinstellung (`preferences.paper`)
4. das Papier, auf dem deine Proben geschrieben sind (Probeblatt v2 ist liniert in deinem Abstand) – so passen Größe und Linien von
   selbst
5. `blank`

`penclone styles` listet eingebaute und eigene Vorlagen; das MCP-Werkzeug `list_styles` liefert sie mit kleinen Vorschaubildern,
damit die KI die Auswahl zeigen kann.

## 13. Die Engine ohne Browser (P2)

**Entscheidung: einfache JavaScript-Module (mit `// @ts-check`-Typ-Kommentaren), die unverändert in Node und im Browser laufen; kein
Build-Schritt, keine Abhängigkeiten.** Dieselben Dateien dienen der CLI, dem geplanten MCP-Server und einer späteren iPad-Seite.

| Teil | Datei | Was es tut | Grundlage |
|---|---|---|---|
| Zufall | `engine/rng.js` | ein Zufallsstrom pro Entscheidung, benannt nach dem, was entschieden wird (Wort + wievieltes Vorkommen, Zeile, Trennstrich) | bekanntes Problem C5 |
| Glyphen | `engine/glyphs.js` | lädt v1/v2-Bibliotheken, misst die x-Höhe, nimmt Doppelgänger für fehlende Zeichen und meldet sie | – |
| Wörter | `engine/shape.js` | Variantenwahl (Position im Wort, falls die Varianten eine haben), leichte Verformung, Abstand nach Tinten-Profil | bisheriger Renderer; Haines et al. (Positionen) |
| Silbentrennung | `engine/hyphenate.js`, `engine/hyph/de-1996.js` | Liang-Algorithmus mit den TeX-Mustern aus hyph-utf8 (MIT) | Liang 1983 |
| Zeilen und Seiten | `engine/layout.js` | Zeile füllen, bis sie voll ist (wie beim Schreiben), Trennung nur gegen große Lücken, Zeilenmodell | gemessene Gewohnheiten, [recherche.md §13](recherche.md#13-zeilen-gewohnheiten-aus-der-eigenen-probe-gemessen) |
| Ausgabe | `engine/output.js` | SVG pro Seite, PDF 1.4 mit Vektorstrichen; ein Pfad pro Zeile und Strichbreite | eigener Vergleich: gerade Segmente sehen bei 600 dpi gleich aus, Dateien 2,5× kleiner |
| Kommandozeile | `bin/penclone.js` | `penclone render`; `profile` und `sample-sheet` leiten bis P6 an die Python-Pipeline weiter | Regel „alles überall“ §2 |

Zeilenmodell, in x-Höhen des Schreibers (Standardwerte aus `layout.json` im Profil, sonst als Annahme markiert):

| Wert | migl06 (Beispiel) | Ersatzwert |
|---|---|---|
| Wortabstand (Tinte zu Tinte), log-normal aus Median und Quartilen | 1,45 (1,22–1,81) | 1,4 (1,15–1,75), Annahme |
| Schrift sitzt über der Linie | 0,23 | 0,2, Annahme |
| Schräge der Zeile | −0,1° ± 0,25° | 0° ± 0,25°, Annahme |
| langsame Drift der Grundlinie (Streuung, Korrelationslänge) | 0,15, 4,2 | 0,15, 4, Annahme |
| x-Höhe | 2,33 mm | 2,5 mm, Annahme |
| Zeilenanfang, Trenn-Lücke, Zeilenabstand, Ränder | – | Annahmen (auf Probeblatt v2 nicht messbar) |

Getrennt wird absichtlich selten: nur wenn das Wort in der nächsten Zeile mehr als 6 x-Höhen leer zurückließe oder gar nicht in eine
Zeile passt. Handschrift hat Flatterrand; die Schwelle ist eine Annahme und wird in P4 geprüft.

## 14. Papier, Stifte, Arbeitsblätter, MCP-Server und Skill (P3)

**Eine Funktion pro Fähigkeit in `lib/commands.js`; Kommandozeile (`bin/penclone.js`) und MCP-Server (`lib/mcp.js`) sind dünne
Schichten darüber, der Skill (`skill/penclone/`) bedient die Kommandozeile.** So ist die Regel „alles überall“ aus §2 im Code
erzwungen.

| Teil | Entscheidung | Grundlage |
|---|---|---|
| MCP-Server | JSON-RPC 2.0 über stdin/stdout, ohne SDK geschrieben (keine Abhängigkeiten); nur Werkzeuge; Antworten mit JSON-Bericht und PNG-Vorschau; Server-Anweisungen sagen der KI, zuerst `get_status` aufzurufen und bei **fehlenden Zeichen den Nutzer zu fragen** | MCP-Spezifikation (Tools, stdio) |
| Fehlende Zeichen | nie Schriftart-Ersatz; gemeldet, und die KI fragt: jetzt auf einem **Zeichenblatt** schreiben (`n§n n§n n§n`, die n liefern Größe und Grundlinie, so lassen sich einzelne Zeichen ohne das ganze Blatt nachtragen), weglassen oder ersetzen | eigener Entwurf; n = x-Höhen-Buchstabe, daran misst die Pipeline die x-Höhe |
| Papier | eingebaute Vorlagen als Vektoren; Grundlinien auf den Linien; bei Karo/Punkten jede k-te Linie, damit der Zeilenabstand mindestens der natürliche ist | §12; k: Annahme |
| Eigenes Papier aus einem Scan | `pipeline/scan_paper.py`: Geraderichten über Projektionsprofile, Linien/Karos/Punkte/Randlinien aus Zeilen- und Spaltenprofilen, Abstand per Ausgleichsgerade über alle Linien; bereinigter Scan bleibt Hintergrund | synthetische Test-Scans (liniert 7,1 mm, Karo und Punkte 5 mm, um 1,2° gedreht): Abstand auf 0,01 mm, Schräglage erkannt |
| Arbeitsblätter | die KI gibt grobe Kästen; penclone findet Antwortlinien im Kasten, probiert Größen von der natürlichen bis 60 % (mindestens 1,4 mm) und meldet Text, der trotzdem nicht passt | §9 |
| Stifte | Vorgaben für Farbe, Breite, Deckkraft; Bleistift-Körnung nur im SVG; **iPad-Look** = gefüllte Umrisse, dünner wo die Hand schnell war (Zwei-Drittel-Gesetz), spitz zulaufende Enden | perfect-freehand (Ansatz), Lacquaniti et al. 1983; Werte sind Annahmen |
| Bearbeitbare Tinte | Xournal++ (`.xopp`, gzip-XML), InkML, Excalidraw (`freedraw`) | §8; nach den Formaten geschrieben, noch nicht in jeder App geöffnet |
| Voreinstellungen | im Profil gespeichert, gelten ohne Option; ein gespeicherter Stift, den es für die gewählte Ausgabe nicht gibt, wird ignoriert | §11 |

iPad-Aufnahmeseite (`lib/capture.js`, P1): kleiner Webserver im Heimnetz mit 128-Bit-Geheimlink, eine Zeichenfläche pro Blattseite, der Pencil schreibt und der Finger scrollt, Striche in pt vom Seitenanfang (die Pipeline liest sie wie einen PDF-Export) plus Zeit, Druck und Neigung; er beendet sich nach dem Import.

Nicht in P3: detect-fields, Textmarker, Kuli-Tintenmodell (Franke & Rose), Bleistift-Körnung im PDF.

## Zielarchitektur

```
Schreibprobe ─┬─ iPad-Webaufnahme (Striche + Zeit + Druck, Zeichen bekannt)
              └─ PDF-Export (nur Form, heutiger Weg)
                    │
              pipeline/ (Python) ──► Glyphen-Bibliothek (JSON, lokal, privat)
                                            │
engine/ (JavaScript-Module mit Typ-Kommentaren, ohne DOM, ohne Abhängigkeiten):
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
| **P2** ✓ | Engine ohne DOM: Layout + Silbentrennung, Zeilenmodell, Seeds pro Stelle, ein Pfad pro Zeile; `penclone render` | erledigt: [§13](#13-die-engine-ohne-browser-p2) |
| **P3** ✓ | Papier (eingebaut + eigene Scans) + Stifte + iPad-Stil; Arbeitsblätter; CLI, MCP-Server und Skill mit vollem Umfang | erledigt: [§14](#14-papier-stifte-arbeitsblätter-mcp-server-und-skill-p3); offen: detect-fields, Textmarker, Tintenmodell |
| P4 | Messen: OCR-Fehlerrate (deutsches TrOCR), HWD, Blindtest | Parameter begründet |
| P5 | **Allgemeine Regeln mit anderen Schreibern prüfen**, datensparsam: `penclone validate` berechnet nur anonyme Statistiken (keine Striche, keine Bilder), die Freiwillige in einem Issue posten | Stufe 1 (IAM-OnDB) erledigt; Werkzeug + Issue-Formular fertig; Antworten sammeln offen |
| P6 | **Paket und Anleitung**: ein npm-Paket (CLI + MCP-Server; Pipeline nach TypeScript portiert oder per pipx mitgeliefert, damit niemand Python von Hand einrichten muss) + Endnutzer-Anleitung (DE/EN) | Anleitung fertig ([anleitung.md](anleitung.md)); Installation von GitHub mit einem Befehl; offen: npm-Veröffentlichung, Python ohne Handarbeit |
| später | Englisch-Paket, OpenType-Export | – |
