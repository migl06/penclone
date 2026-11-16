# penclone

**Text in deiner eigenen Handschrift – erzeugt aus deinen echten Stiftstrichen.**
Deutsch zuerst (ä ö ü ß, „Anführungszeichen“, Silbentrennung), Englisch auch. Ein Werkzeug mit drei Zugängen: **Kommandozeile**,
**MCP-Server** für KI-Apps (Claude, ChatGPT, Cursor, …) und **Agent Skill** – jeder kann den ganzen Ablauf.

[English](README.md) · [Anleitung](docs/de/anleitung.md)

penclone nimmt ein paar Seiten deiner Handschrift (Vektor-Striche, mit dem Stift auf einem Tablet geschrieben: iPad, Android-Tablet, Surface, …), macht aus jedem Zeichen mehrere
Varianten und schreibt damit neuen Text. Anders als bei Handschrift-Schriftarten sieht derselbe Buchstabe nie zweimal gleich aus:
Varianten werden zufällig gewählt, die Grundlinie wandert wie bei dir, der Druck ändert sich, und Buchstaben werden nach ihrer
tatsächlichen Tinte gesetzt, damit sie sich nie berühren.

Gedacht für: Lernzettel, Briefe und Karten, Antworten auf Arbeitsblättern, Mockups.

**Für Druckschrift.** penclone ist für Handschrift in Druckschrift gemacht: Buchstaben einzeln geschrieben, einige davon
verbunden. Für Schreibschrift (verbundene Schrift, bei der der Stift ganze Wörter lang auf dem Papier bleibt) ist es nicht
gedacht. Solche Schrift lässt sich noch nicht zuverlässig in Buchstaben zerlegen.

> **Stand: früh, aber benutzbar.** Funktioniert: Handschrift-Profile, Probeblätter (ganz oder nur fehlende Zeichen), Layout mit
> deutscher Silbentrennung und einem aus deinen Proben gemessenen Zeilenmodell, Papier (liniert, kariert, punktiert, deutsche
> Lineaturen, dein eigenes eingescanntes Papier), Stifte und iPad-Look, Arbeitsblätter, PDF / SVG / PNG und bearbeitbare Tinte
> (Xournal++, InkML, Excalidraw), MCP-Server, Skill. Noch nicht: Lesbarkeit messen (OCR), npm-Veröffentlichung.
> Details: [docs/de/bekannte-probleme.md](docs/de/bekannte-probleme.md), [docs/de/entscheidungen.md](docs/de/entscheidungen.md).

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

## Installieren

Braucht Node.js ≥ 20, Python 3 mit `numpy scipy pillow` (`pip install -r pipeline/requirements.txt`) und poppler
(`pdftocairo`, `pdftoppm`; z. B. `apt install poppler-utils`, `brew install poppler`).

```bash
npm install -g github:migl06/penclone      # oder: git clone … && node bin/penclone.js
penclone status                             # was da ist und was als Nächstes zu tun ist
```

## Drei Zugänge

**Was ist penclone – CLI, MCP-Server oder Skill?** Alles drei, über dieselben Funktionen (`lib/commands.js`), damit keiner mehr
kann als die anderen ([warum](docs/de/entscheidungen.md#2-cli-mcp-server-oder-skill)):

| Zugang | Für | Start |
|---|---|---|
| Kommandozeile | dich, Skripte | `penclone help` |
| MCP-Server | KI-Apps: Die KI ruft penclones Werkzeuge auf (schreiben, Arbeitsblatt ausfüllen, Papier aus einem Scan anlegen, …) und bekommt Vorschaubilder zurück | `claude mcp add penclone -- penclone mcp` · Claude Desktop: `{"mcpServers": {"penclone": {"command": "penclone", "args": ["mcp"]}}}` |
| Agent Skill | KI-Agenten, die Befehle auf deinem Rechner ausführen | `skill/penclone/` in den Skill-Ordner des Agenten kopieren |

Mit einer KI-App sagst du einfach „schreib diese Notizen in meiner Handschrift auf liniertes Papier“ oder gibst ihr den Scan eines
Arbeitsblatts; die KI entscheidet, was wohin kommt, penclone vermisst die Seite und passt die Schrift ein. Fehlen Zeichen in deiner
Schrift, fragt die KI dich, ob du sie jetzt schreiben willst (ein kleines Blatt nur mit diesen Zeichen), sie weglassen oder ersetzen.

## Handschrift-Profile

Deine Schrift wird unter einem Namen gespeichert und wiederverwendet. Profile liegen **außerhalb des Repositorys**
(`~/.local/share/penclone/profiles/<name>/`) und überstehen Updates und Neu-Downloads.

```bash
penclone profile create ich
penclone sample-sheet --out sheet.pdf                   # in einer Notiz-App auf dem Tablet schreiben, als PDF exportieren (~30 Min.)
penclone capture ich                                    # oder: direkt im Browser des Tablets schreiben (mit Zeit und Druck)
penclone import ich geschrieben.pdf --manifest sheet.json   # Striche → Glyphen, misst Wortabstände und Zeilen-Drift
penclone sample-sheet --chars "§@" --out fehlend.pdf    # später: nur fehlende Zeichen
penclone report ich --sheet glyphen.png                 # Qualitätsbericht
penclone profile export ich ich.zip                     # Sicherung / anderer Rechner
```

penclone wird besser durch **mehr Proben** (mehr Varianten, bessere Proportionen) und durch **allgemeine Regeln**, die für alle gleich
und in die Pipeline eingebaut sind ([docs/de/regeln.md](docs/de/regeln.md)). Nutzer können diese Regeln nicht ändern; persönliche
Ausnahmen gibt es nur als letzten Ausweg. Es wird kein neuronales Netz trainiert.

**Deine Schrift beibringen:** die vorgegebenen Probesätze schreiben – keinen freien Text, keine Alphabet-Reihen –, normal und in
normalem Tempo ([warum](docs/de/entscheidungen.md#7-penclone-deine-schrift-beibringen-vorgegebene-sätze)).

## Schreiben

```bash
penclone render notizen.txt -o notizen.pdf                                 # deine Voreinstellungen, sonst blanko, Kuli
penclone render notizen.txt --paper lin27 --pen fineliner -o notizen.pdf   # Lineatur 27, schwarzer Fineliner
penclone render notizen.txt --output ipad --paper dotted -o notizen.pdf    # digitale Tinte wie in einer Notiz-App
penclone render notizen.txt -o notizen.xopp                                # bearbeitbare Striche in Xournal++
penclone template add block --profile ich --from leere_seite.jpg           # eigenes Papier, aus einem Scan vermessen
penclone fill arbeitsblatt.pdf --fields felder.json -o ausgefuellt.pdf     # Antworten in Kästen eingepasst, Bericht pro Feld
penclone prefs ich output=paper paper=lined pen=ballpoint                  # gemerkte Standardwerte
```

Jeder Zeilenumbruch im Text beginnt eine neue Zeile. Die Schrift steht auf den Linien von liniertem, kariertem und punktiertem
Papier; auf Karopapier wird jede zweite Linie benutzt, wenn die Kästchen kleiner als deine Zeilenhöhe sind. Fehlende Zeichen werden
weggelassen und gemeldet – nie durch eine Schriftart ersetzt. Derselbe `--seed` gibt dasselbe Ergebnis, und ein geändertes Wort lässt
die anderen Zeilen gleich.

| Option | Werte |
|---|---|
| `--paper` | `blank`, `lined`, `lined-narrow` / `-college` / `-wide` (US), `lin27`, `squared`, `lin22`, `lin26`, `lin28`, `dotted`, deine Vorlage oder eine Scan-Datei |
| `--output`, `--pen` | `paper`: `ballpoint` (Kuli), `fineliner`, `gel`, `fountain` (Füller), `pencil` (Bleistift) · `ipad`: `pen`, `pencil` |
| `--color`, `--size`, `--line-spacing`, `--grid`, `--margin`, `--page` | Farbe; x-Höhe, Abstände in mm; Seite `a4`/`a5`/`letter`/`BxH` |
| `--pages N` | Text auf N Seiten einpassen (schreibt kleiner, wenn nötig) |
| Ausgabedatei | `.pdf`, `.svg`, `.png` und bearbeitbare Tinte: `.xopp` (Xournal++), `.inkml`, `.excalidraw` |

**Arbeitsblätter und eingescannte Seiten:** Die KI (oder du) gibt jeder Antwort einen groben Kasten; penclone richtet den Scan
gerade, findet gedruckte Antwortlinien im Kasten, passt den Text ein (kleiner wenn nötig, nie unlesbar klein) und meldet, was nicht
passt ([warum](docs/de/entscheidungen.md#9-eingescannte-seiten-und-arbeitsblätter-die-ki-sagt-was-wohin-penclone-passt-es-ein)).

GoodNotes/Notability: PDF importieren und darüber schreiben; die erzeugten Striche lassen sich dort nicht bearbeitbar machen, weil
das Format geschlossen ist ([Details](docs/de/entscheidungen.md#bearbeitbar-auf-dem-ipad-goodnotes)).

## Datenschutz

Handschrift ist persönlich. Deine Proben, Glyphen und Profile bleiben **auf deinem Rechner**: Profile liegen in
`~/.local/share/penclone/profiles/` (oder `PENCLONE_HOME`, z. B. `./data`), und `samples/`, `data/`, `profiles/`, `scans/`, `*.pdf`,
`*.svg`, `*.zip` und Glyphen-Dateien werden von Git ignoriert. Die CI lehnt Commits ab, die sie enthalten. penclone lädt nichts hoch.

## Ziel: so menschlich wie möglich

Eine Seite von penclone soll aussehen, als hättest du sie mit der Hand geschrieben – man soll keinen Unterschied sehen. Kein
Zeichen kommt zweimal gleich vor, keine Zeile ist ganz gerade, kein Abstand ganz gleich. Jede Zufallsentscheidung (Variante,
Größe, Neigung, Druck, Abstand, Grundlinie) wird aus den Verteilungen gezogen, die in *deinen* Proben gemessen wurden. Die
Schwankung ist also deine und kein allgemeines Zittern. Alles, was nach Maschine oder ausgeschnittenen Buchstaben aussieht –
gleiche Wiederholungen, konstante Abstände, parallele Grundlinien, gleichförmige Striche –, gilt als Fehler.

penclone schreibt **deine eigene** Handschrift aus **deinen eigenen** Proben. Unterschriften gehören nicht dazu: Wo eine
eigenhändige Unterschrift verlangt ist, zählt eine geplottete oder gedruckte nicht.

## Mitmachen

Fehlerberichte, Ideen und Pull Requests sind willkommen – siehe [CONTRIBUTING.md](CONTRIBUTING.md).

## Lizenz

[MIT](LICENSE)
