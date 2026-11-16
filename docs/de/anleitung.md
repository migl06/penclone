# Anleitung

So kommst du von null zu Text in deiner eigenen Handschrift. English: [../guide.md](../guide.md).

## 1. Installieren

Du brauchst:

- **Node.js** ab Version 20
- **Python 3** mit `numpy`, `scipy` und `pillow`
- **poppler** (`pdftocairo`, `pdftoppm`)

```bash
pip install numpy scipy pillow                  # oder: pip install -r pipeline/requirements.txt
sudo apt install poppler-utils                  # macOS: brew install poppler
npm install -g github:migl06/penclone
penclone status
```

`penclone status` sagt dir immer, was als Nächstes zu tun ist.

## 2. Deine Schrift beibringen (einmal, ca. 30 Minuten)

```bash
penclone profile create ich
penclone sample-sheet --out sheet.pdf
```

`sheet.pdf` enthält vorgegebene deutsche Sätze. Jeder Satz hat eine Linie darunter. Schreib sie in deiner normalen
**Druckschrift** (Buchstaben einzeln; wo du sonst zwei Buchstaben verbindest, verbinde sie auch hier). Für Schreibschrift ist
penclone nicht gedacht.

- **Am Tablet mit Stift (empfohlen)** – iPad mit Apple Pencil, Android-Tablet, Surface, …: Öffne `sheet.pdf` in einer
  Notiz-App (GoodNotes, Notability, Xournal++ o. ä.), schreib mit dem Stift und exportiere die Seiten danach als PDF. Die App
  muss die Striche dabei als Vektor-Linien exportieren, das gibt das sauberste Ergebnis.
- **Direkt im Browser des Tablets:** `penclone capture ich` zeigt einen Link. Öffne ihn im Browser auf dem Tablet (gleiches
  WLAN) und schreib die Sätze mit dem Stift. Mit dem Finger scrollst du, am Ende tippst du „Fertig“. penclone liest alles
  sofort ein und speichert auch Zeit und Druck.
- **Noch nicht möglich:** auf Papier schreiben und einscannen. penclone braucht die Striche als Vektoren, ein Scan ist nur ein
  Bild. (Eingescanntes *leeres* Papier als Vorlage geht dagegen, siehe 5.)

So schreibst du: jeden Satz auf die Linie darunter, normal und in normalem Tempo, nicht extra schön. Vertippt? Den ganzen Satz
durchstreichen und neu schreiben.

```bash
penclone import ich geschrieben.pdf --manifest sheet.json
```

penclone ordnet die Striche den Buchstaben zu. Es baut je Zeichen mehrere Varianten und misst deine Wortabstände, wie weit deine
Grundlinie wandert und wie schräg deine Zeilen laufen.

## 3. Schreiben lassen

```bash
penclone render notizen.txt -o notizen.pdf
```

- Jeder Zeilenumbruch im Text ist ein Zeilenumbruch auf dem Papier. Eine leere Zeile bleibt leer.
- Lange Wörter werden am Zeilenende nur dann getrennt, wenn sonst eine große Lücke bliebe.
- Andere Fassung desselben Texts: `--seed 2`.

Papier, Stift, Ausgabe:

```bash
penclone render notizen.txt --paper lin27 --pen fineliner -o notizen.pdf      # Lineatur 27, Fineliner
penclone render notizen.txt --paper squared -o notizen.pdf                    # kariert (jede 2. Linie)
penclone render notizen.txt --output ipad --paper dotted -o notizen.pdf       # wie eine Notiz-App
penclone render notizen.txt -o notizen.xopp                                   # bearbeitbar in Xournal++
penclone styles                                                               # alles, was es gibt
```

Merken, was du meistens willst:

```bash
penclone init                                   # fragt Sprache, Ausgabe und Papier
penclone prefs ich paper=lined pen=fineliner    # jederzeit änderbar; "paper=" löscht einen Wert
```

Mehrere Handschriften (z. B. deine Schön- und deine Alltagsschrift, oder je ein Profil für jede Person, die penclone auf
diesem Rechner mit ihrer eigenen Schrift nutzt): leg für jede ein eigenes Profil an. Eine davon ist aktiv und wird immer benutzt, ohne dass du gefragt wirst. Gewechselt wird nur, wenn du es sagst:

```bash
penclone use                       # zeigt alle Handschriften, * = aktiv
penclone use schoenschrift         # ab jetzt diese, bis du wieder wechselst
penclone render brief.txt --profile alltag -o brief.pdf   # nur dieses eine Mal eine andere
```

In einer KI-App reicht: „schreib ab jetzt mit meiner Schönschrift“.

## 4. Fehlende Zeichen

Hast du ein Zeichen nie geschrieben (z. B. `§`), lässt penclone es weg und sagt dir das. Eine Schriftart als Ersatz gibt es nicht.
Nachtragen geht in zwei Minuten:

```bash
penclone sample-sheet --chars "§@" --out fehlend.pdf
# schreiben: das Zeichen jeweils zwischen zwei kleine n, dreimal ("n§n n§n n§n")
penclone import ich fehlend-geschrieben.pdf --manifest fehlend.json
```

Die kleinen n zeigen penclone, wie groß du schreibst.

## 5. Eigenes Papier

Scanne oder fotografiere eine **leere** Seite deines Blocks:

```bash
penclone template add block --profile ich --from leere_seite.jpg
penclone render notizen.txt --paper block -o notizen.pdf
```

penclone richtet den Scan gerade und erkennt selbst, ob er liniert, kariert, punktiert oder blanko ist. Linienabstand und
Randlinien misst es ebenfalls. Der Scan bleibt als Hintergrund (`--no-background`: nur die Maße).

## 6. Arbeitsblätter ausfüllen

Für jede Antwort gibst du einen groben Kasten in mm von der linken oberen Ecke an (`felder.json`):

```json
{"fields": [{"box": [18, 50, 175, 28], "text": "Vertraulichkeit, Integrität und Verfügbarkeit"}]}
```

```bash
penclone fill arbeitsblatt.pdf --fields felder.json -o ausgefuellt.pdf
```

Was penclone dabei tut:

- gedruckte Antwortlinien im Kasten finden und darauf schreiben
- kleiner schreiben, wenn es eng wird, aber nie unlesbar
- melden, was nicht passt

Mit einer KI-App (siehe 7) übernimmt die KI das Festlegen der Kästen.

## 7. Mit einer KI-App (MCP)

penclone ist auch ein MCP-Server. Die KI ruft dann penclones Werkzeuge selbst auf:

```bash
claude mcp add penclone -- penclone mcp          # Claude Code
```

Claude Desktop, in `claude_desktop_config.json`:

```json
{"mcpServers": {"penclone": {"command": "penclone", "args": ["mcp"]}}}
```

Dann reicht zum Beispiel: „Schreib diese Notizen in meiner Handschrift auf Lineatur 27“ oder „Füll dieses Arbeitsblatt aus“ (mit
Scan). Fehlen Zeichen, fragt die KI dich, wie es weitergehen soll. Dateien landen ohne Pfadangabe in `~/penclone/`.

Für Agenten, die Befehle ausführen, gibt es den Skill `skill/penclone/`.

## 8. Datenschutz und Grenzen

- Proben, Glyphen und Profile bleiben auf deinem Rechner (`~/.local/share/penclone/`). penclone lädt nichts hoch.
- Sicherung: `penclone profile export ich ich.zip`.
- Freiwillig helfen: `penclone validate ich` gibt nur Zahlen aus (Proportionen, Abstände) und keine Striche. Die kannst du in ein
  Issue kopieren, um die allgemeinen Regeln zu prüfen.
- penclone schreibt deine eigene Handschrift in Druckschrift (nicht Schreibschrift); Unterschriften leistest du weiter selbst.
