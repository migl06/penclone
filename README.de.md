# penclone

**Text in deiner eigenen Handschrift – erzeugt aus deinen echten Stiftstrichen.**
Deutsch zuerst (ä ö ü ß, „Anführungszeichen“, Silbentrennung), Englisch auch. Geplant als Kommandozeilen-Programm, MCP-Server
und Agent Skill, die jeweils den ganzen Ablauf können.

[English](README.md)

penclone nimmt ein paar Seiten deiner Handschrift (Vektor-Striche vom iPad / Apple Pencil), macht aus jedem Zeichen mehrere
Varianten und schreibt damit neuen Text. Anders als bei Handschrift-Schriftarten sieht derselbe Buchstabe nie zweimal gleich aus:
Varianten werden zufällig gewählt, die Grundlinie wandert, der Druck ändert sich, Buchstaben werden nach ihrer tatsächlichen Tinte
gesetzt, damit sie sich nie berühren, und Kästen und Kreise sind von Hand gezeichnet.

Gedacht für: Lernzettel, Briefe und Karten, Mockups, eine eigene Handschrift-Schriftart.

> **Stand: früh.** Funktioniert: Glyphen-Pipeline, Handschrift-Profile, Qualitätsbericht und `penclone render`, das Text in deiner
> Schrift als PDF oder SVG schreibt, ohne Browser (Layout, deutsche Silbentrennung, Zeilenmodell aus deinen Proben gemessen).
> Geplant: MCP-Server, Skill, Papier- und Stiftstile, iPad-Ausgabe. Probleme und Plan:
> [docs/de/bekannte-probleme.md](docs/de/bekannte-probleme.md), [docs/de/entscheidungen.md](docs/de/entscheidungen.md).

## Auf Forschung gebaut, nicht geraten

Jede Funktion und jeder Standardwert kommt aus einer zitierten Quelle, aus einer Messung deiner eigenen Proben, oder ist als
Annahme markiert ([Belege statt Raten](docs/de/entscheidungen.md#5-belege-statt-raten)). Die Fakten hinter den Hauptfunktionen:

| Funktion | Fakt | Quelle |
|---|---|---|
| Mehrere Varianten pro Buchstabe, keine sichtbaren Wiederholungen | Menschen bemerken wiederholte Glyphen; gute Synthese wählt zufällig und greift erst auf Ersatz zurück, wenn es weniger als 8 exakte Proben gibt. | Haines, Mac Aodha, Brostow: *My Text in Your Handwriting*, ACM TOG 2016 |
| Proben als Sätze statt Alphabet-Reihen | Anfangs- und Endbuchstaben werden anders geschrieben; ungewohnter Text lässt Schreiber stocken und verändert die Schrift; Probetext wird nach Buchstaben- und Paarhäufigkeit gewählt. | Haines et al. 2016 (mit Verweis auf Srihari et al. 2002) |
| Grundlinie wandert und kommt zurück | Man bleibt nahe der Linie, driftet aber in Bögen, weil die Hand dreht; modelliert mit Kalman-Glättung entlang der Zeile. | Haines et al. 2016 |
| Drift, Schräge und Wortabstände sind deine | Auf deinem eigenen Probeblatt gemessen: Drift der Grundlinie als Zufallslauf, der zur Linie zurückgezogen wird (Ornstein-Uhlenbeck, per Variogramm angepasst), Wortabstände Tinte zu Tinte. | eigene Messung, [Recherche §13](docs/de/recherche.md#13-zeilen-gewohnheiten-aus-der-eigenen-probe-gemessen) |
| Natürliche Variation aus der Bewegung | Menschenähnliche Varianten eines Wortes: Zeitparameter µ und σ des Sigma-Lognormal-Modells um ±15 % stören. | Martín-Albo, Plamondon, Vidal, ICFHR 2014 |
| Kugelschreiber-Look | Tintenmenge hängt von Druck und Geschwindigkeit ab; Kuli-Paste zeigt typische Spurmuster. | Franke & Rose, Ink-Deposition Model, IWFHR 2004 |
| Bleistift-Look | Ergebnis hängt von Mine, Papierstruktur und Druck ab. | Sousa & Buchanan, Computer Graphics Forum 2000 |
| iPad-Look | Strichbreite aus simuliertem Druck (thinning, smoothing, taper). | perfect-freehand |
| Deutsche Silbentrennung | Liang-Algorithmus mit TeX-Mustern (`de-1996`, hyph-utf8, MIT); im Deutschen wegen langer Komposita besonders wichtig. | Liang 1983; hyph-utf8 |
| Häufigste deutsche Buchstabenpaare in den Proben | ER, EN, CH, DE, EI, ND, TE, IN, IE, GE. | Tabellen Uni Wuppertal / HU Berlin |
| Abstände nach weißer Fläche | Schriftgestalter setzen Abstände nach der Fläche neben dem Buchstaben, nicht nach der engsten Stelle. | HT Letterspacer |
| Lesbarkeit und Stil messen | Deutscher Handschrift-Erkenner (TrOCR, 4,1 % Zeichenfehlerrate auf seinem Testset); HWD bewertet Handschrift-Stil besser als FID. | fhswf/TrOCR_german_handwritten; Pippi et al., BMVC 2023 |
| Bearbeitbare Tinte, nicht nur PDF | GoodNotes-Format ist nicht dokumentiert, daher keine bearbeitbare GoodNotes-Tinte; InkML ist ein W3C-Standard für digitale Tinte; Xournal++ und Excalidraw haben offene Formate. | W3C InkML 2011; siehe Recherche |

Vollständige Liste mit Links und wie tief jede Quelle gelesen wurde: [docs/de/recherche.md](docs/de/recherche.md).

## Handschrift-Profile (funktioniert)

Deine Handschrift wird unter einem Namen gespeichert und wiederverwendet. Profile liegen **außerhalb des Repos**
(`~/.local/share/penclone/profiles/<name>/`) und überstehen Updates und neues Herunterladen.

```bash
python3 pipeline/profiles.py create ich --pdf meine_proben.pdf --lang de   # Proben importieren
python3 pipeline/profiles.py build ich                                    # Glyphen-Bibliothek bauen
python3 tools/glyph_report.py --profile ich --sheet bogen.png             # Qualitätsbericht
python3 pipeline/profiles.py export ich ich.zip                           # Sicherung / anderer Rechner
```

penclone wird besser durch **mehr Proben** (mehr Varianten, bessere Proportionen) und durch **allgemeine Regeln**, die für alle gleich
sind und in der Pipeline stecken ([docs/de/regeln.md](docs/de/regeln.md)) – z. B. Zeichen bleiben wie geschrieben, Umlaute bekommen die
Größe ihrer Grundbuchstaben, eine Variante, die wie ein anderer Buchstabe aussieht, wird übersprungen. Nutzer können diese Regeln
nicht ändern; persönliche Ausnahmen gibt es nur als letzten Ausweg, normalerweise sind sie leer. Es wird kein neuronales Netz
trainiert.

**Deine Schrift beibringen:** die vorgegebenen Probesätze schreiben – keinen freien Text, keine Alphabet-Reihen –, normal und in
normalem Tempo, etwa 2–4 Seiten ([warum](docs/de/entscheidungen.md#7-penclone-deine-schrift-beibringen-vorgegebene-sätze)).

## Text schreiben (funktioniert)

```bash
penclone render notizen.txt --profile ich -o notizen.pdf            # oder: node bin/penclone.js render …
penclone render notizen.txt --profile ich --page a5 --margin 12 --size 2.5mm --line-spacing 7.1mm -o notizen.svg
echo "Hallo Welt" | penclone render - --profile ich -o hallo.pdf
```

Jeder Zeilenumbruch im Text beginnt eine neue Zeile; eine leere Zeile bleibt leer. penclone meldet Zeichen, die in deinen Proben
fehlen (sie werden weggelassen, nie durch eine Schriftart ersetzt), und Doppelgänger, die es stattdessen genommen hat (’ → ').
Derselbe `--seed` gibt dasselbe Ergebnis, und ein geändertes Wort lässt die anderen Zeilen gleich. Wortabstände, Drift der
Grundlinie, Schräge und die Standardgröße kommen aus deinem Probeblatt v2, wenn das Profil eins hat; sonst sind die Standardwerte
als Annahme markiert ([Details](docs/de/entscheidungen.md#13-die-engine-ohne-browser-p2)).

## Alles einstellbar (teils geplant)

Schon jetzt: `--page`, `--margin`, `--size`, `--line-spacing`, `--color`, `--seed`, `--lang`, `--no-hyphenation`, Ausgabe `.pdf`
und `.svg`. Geplant:

| Option | Werte |
|---|---|
| `--output` | `paper` (Stift auf Papier simuliert) · `ipad` (saubere digitale Tinte) |
| `--pen` | `ballpoint` (Kuli), `pencil` (Bleistift), `fineliner`, `gel`, `fountain` (Füller), `highlighter` (iPad: `pen`, `pencil`, `highlighter`) |
| `--paper` | `blank`, `lined` (liniert), `squared` (kariert), `dotted` (punktiert); Vorlagen `lin22`, `lin26`, `lin27`, `lin28`; oder dein eigener Scan/PDF |
| `--line-spacing`, `--grid`, `--margin`, `--page` | Maße in mm, Seite `a4`/`a5`/`letter`/eigene |
| `--size` | x-Höhe in mm oder `auto` = deine eigene Größe relativ zur Linie, gemessen an deinen Proben |
| `--color`, `--width`, `--pages` | Tintenfarbe, Strichbreite, auf N Seiten einpassen |
| `--format` | `pdf`, `svg`, `png` und bearbeitbare Tinte: `xopp` (Xournal++), `excalidraw`, `inkml` |

**Eingescannte Seiten und Arbeitsblätter (geplant):** Die KI (oder du) sagt mit einem groben Kasten, was wohin kommt; penclone misst den
Platz, passt deine Schrift ein und meldet, wenn etwas nicht passt
([warum](docs/de/entscheidungen.md#9-eingescannte-seiten-und-arbeitsblätter-die-ki-sagt-was-wohin-penclone-passt-es-ein)).

GoodNotes/Notability: PDF (oder PNG-Zeilen) importieren und darüber schreiben; die erzeugten Striche selbst lassen sich dort nicht
bearbeitbar machen, weil das Format geschlossen ist ([Details](docs/de/entscheidungen.md#bearbeitbar-auf-dem-ipad-goodnotes)).

## Datenschutz

Handschrift ist persönlich. Deine Proben, Glyphen und Profile bleiben **auf deinem Rechner**: Profile liegen in
`~/.local/share/penclone/profiles/` (oder `PENCLONE_HOME`, z. B. `./data`), und `samples/`, `data/`, `profiles/`, `scans/`, `*.pdf`,
`*.svg`, `*.zip` und Glyphen-Dateien werden von Git ignoriert. Die CI lehnt Commits ab, die sie enthalten. penclone lädt nichts hoch.

## Nicht-Ziel

penclone soll natürlich aussehen, ist aber **kein** Werkzeug, um Dokumente zu fälschen oder Echtheitsprüfungen zu umgehen. Es gibt
keine Funktionen, die KI-Erkenner, Schriftgutachten oder physische Prüfungen täuschen sollen.

## Mitmachen

Fehlerberichte, Ideen und Pull Requests sind willkommen – siehe [CONTRIBUTING.md](CONTRIBUTING.md).

## Lizenz

[MIT](LICENSE)
