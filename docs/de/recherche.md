# Recherche: Wie man Text in eigener Handschrift erzeugt (mit Blick auf Deutsch)

Stand: 16.11.2026. Bei jeder Quelle steht, **wie tief ich sie gelesen habe** – Volltext, Folien, README oder nur
Zusammenfassung/Abstract. Zahlen übernehme ich nur aus Quellen, die ich selbst gelesen habe.

## 1. Glyphen-basierter Ansatz: „My Text in Your Handwriting“ (Haines, Mac Aodha, Brostow, ACM TOG 2016)

Gelesen: **Volltext** (Autorenfassung, [UCL Discovery](https://discovery.ucl.ac.uk/10075697/7/Brostow_My%20Text%20in%20Your%20Handwriting_AAM2.pdf),
[Projektseite FAU](https://reality.tf.fau.de/projects/haines/haines16handwriting.html), DOI 10.1145/2886099).

Das ist das Paper, das unserem Ansatz am nächsten kommt: echte Glyphen aus einer Schreibprobe, neu zusammengesetzt.

| Thema | Was das Paper macht | Was wir übernehmen |
|---|---|---|
| Schreibprobe | ca. 4 A4-Seiten, jede zweite Zeile, 10–30 min. **Ganze Sätze**, automatisch so gewählt, dass häufige Buchstaben *und Buchstabenpaare* abgedeckt sind (Kosten wie beim Scrabble, plus Paar-Term). Unbekannter Text lässt Schreiber stocken – das verändert die Schrift. | Neue Probe aus **deutschen** Sätzen, gewählt nach deutscher Buchstaben- und Paarhäufigkeit. |
| Position im Wort | Glyphen tragen „Wortanfang / Mitte / Ende“, weil Anfangs- und Endbuchstaben anders geschrieben werden (mit Verweis auf Srihari et al. 2002). | Positions-Tag pro Glyphe. |
| Wie viele Varianten | Ersatz (falsche Position, klein statt groß) ist nur erlaubt, wenn es **weniger als 8** exakte Treffer gibt. | 6–8 Varianten für häufige Zeichen als Ziel. |
| Glyphenwahl | Dynamische Programmierung über das Wort; Kosten = passt die Glyphe + passen Nachbarn zusammen (Strichdicke, Verbindung). **Paare, die in der Probe nebeneinander standen, kosten 0** → kurze Wörter werden oft ganz übernommen. Wiederholungen vermeidet Gumbel-Rauschen auf den Kosten (λ = 10 η). | Paare aus der Probe bevorzugen; „nie dieselbe Variante zweimal“ durch weiche Kosten ersetzen. |
| Abstand horizontal | Gleichverteilt gezogen aus dem Bereich, den die Nachbar-Glyphen in der Probe hatten. | Abstände aus echtem Text lernen statt nur Mindestabstand. |
| Höhe / Grundlinie | **Kalman-Glättung** über die Zeile: jede Glyphe will auf der Linie liegen (schwach, σ = 1 Zeilenhöhe), Nachbarn wollen den Höhenversatz aus der Probe. Ergebnis: Text driftet weg und kommt zurück („Bögen, weil die Hand dreht“). | Zeilenmodell statt unabhängigem Zufallslauf pro Wort. |
| Satzzeichen | Feste Höhe über der Grundlinie, weil das Modell Komma und Apostroph sonst verwechselt. | Machen wir schon so. |
| Stift | Tinte wird aus dem Scan übernommen; Stift kann ersetzt werden (Kuli, HB-Bleistift, Füller, Gel, Marker). Gerät-Proben (Tablet) haben **keine Textur** und wirken unnatürlich. Zum Drucken: Tintenstrahl besser als Laser. | Stift-Textur müssen wir synthetisch erzeugen, weil unsere Proben vom iPad kommen. |

## 2. Bewegung statt Form verändern: Sigma-Lognormal-Modell

Gelesen: **Folien** (Martín-Albo, Plamondon, Vidal, ICFHR 2014,
[PDF](https://iapr.org/archives/icfhr2014/wp-content/uploads/2015/02/ICFHR2014-Albo.pdf)).

- Ein Strich wird in Teilbewegungen zerlegt; jede hat 6 Parameter (D, t₀, µ, σ, θ_start, θ_ende), die Geschwindigkeit folgt einer Lognormal-Kurve.
- Menschliche Variation = **µ und σ jeweils gleichverteilt um ±15 % stören**, dann Geschwindigkeit neu integrieren.
- Voraussetzung: **Zeitstempel** pro Punkt. Unser PDF-Export hat keine → erst mit einer Aufnahme am iPad möglich (siehe [entscheidungen.md](entscheidungen.md)).

## 3. Verzerrung auf Zeilenebene: Varga & Bunke

Gelesen: nur **Abstracts/Zusammenfassungen** ([ICPR 2004 / IJPRAI](https://worldscientific.com/doi/abs/10.1142/S0218001404003666),
[Kalibrierung Cheng & Lopresti 2010](https://engineering.lehigh.edu/sites/engineering.lehigh.edu/files/_DEPARTMENTS/cse/research/tech-reports/2010/LU-CSE-10-003.pdf)).

- Ganze Textzeilen werden mit **langsam veränderlichen Funktionen** („CosineWave“ = aneinandergereihte Kosinus-Halbwellen mit
  zufälliger Länge) verzerrt: Scherung, Skalierung, Grundlinie, Strichdicke ändern sich entlang der Zeile allmählich.
- Konkrete Parameterbereiche habe ich nicht gefunden. Die Idee passt aber genau zu Lücke B3 (keine Zeilenebene).

## 4. Stift und Papier

- **Kugelschreiber:** Franke & Rose, „Ink-Deposition Model“ (IWFHR 2004; gelesen: nur Zusammenfassung,
  [PDF](https://rdg.ext.hitachi.co.jp/iwfhr9/AfterWS/IWFHR9-Proceedings/docs/029_x_franke-Ink-Dep.pdf)). Tintenmenge hängt von
  Druck und Geschwindigkeit ab; mit Position, Geschwindigkeit und Druck ließen sich Spuren erzeugen, die kaum von echten zu
  unterscheiden sind. Kugelschreiber-Paste zeigt typische innere Spurmuster (Rillen, Aussetzer).
- **Bleistift:** Sousa & Buchanan, „Observational Models of Graphite Pencil Materials“ (Computer Graphics Forum 2000; gelesen:
  nur Abstract, [EG Digital Library](https://diglib.eg.org/handle/10.2312/8605)). Ergebnis hängt von Minenzusammensetzung,
  **Papierstruktur** und Druck ab → Bleistift = Grauwert × Papierkorn-Rauschen × Druck.
- **Geschwindigkeit ohne Zeitstempel schätzen:** Das Zwei-Drittel-Potenzgesetz der Motorik (Lacquaniti et al. 1983: Geschwindigkeit
  ∝ Krümmung^(−1/3), also langsamer in Kurven) ist ein Standardergebnis; hier **nicht neu nachgelesen**. Damit kann man aus der Form
  abschätzen, wo der Stift langsam war (mehr Tinte, dunkler) und wo schnell (dünner, heller).
- **iPad-Look:** [perfect-freehand](https://github.com/steveruizok/perfect-freehand) (gelesen: README). Strichbreite aus simuliertem
  Druck (über Punktabstand), Optionen `thinning`, `smoothing`, `streamline`, `taper`. Genau der Look von Notiz-Apps.
- **Papierformate (DE):** Lineatur 22 = kariert 5 mm ohne Rand, 26 = kariert 5 mm mit Rand, 28 = kariert mit Doppelrand,
  27 = liniert mit Doppelrand (Zeilenabstand laut einer Quelle 9 mm; nicht doppelt geprüft) – Händlerangaben, z. B.
  [familie.de](https://www.familie.de/testberichte/lineaturen-so-findet-ihr-das-richtige-heft-fuer-euer-schulkind--01GZRDJNST98W54VMBMP8X9VGQ).

## 5. Was Deutsch besonders macht

| Punkt | Folge für uns | Quelle |
|---|---|---|
| Zeichen: ä ö ü ß Ä Ö Ü, „ “ ‚ ‘, » «, €, § | Zeichensatz ist eine Obermenge von Englisch. Englisch kostet danach fast nichts extra. | – |
| **Substantive groß** | Viel mehr Großbuchstaben als im Englischen → Groß/klein-Verhältnis (A3) und Varianten bei Großbuchstaben wichtiger. | – |
| Häufigste Paare: ER, EN, CH, DE, EI, ND, TE, IN, IE, GE (dazu SS als häufigster Doppelbuchstabe) | Diese Paare gehören mehrfach in die Schreibprobe; „ch“, „ck“, „sch“, „tz“, „st“ als Einheiten aufnehmen. | [Uni Wuppertal](https://ddi.uni-wuppertal.de/fileadmin/informatikdidaktik/OER/Spioncamp/buchstabenhaeufigkeit-station.pdf), [HU Berlin](https://www2.informatik.hu-berlin.de/Forschung_Lehre/algorithmenII/Lehre/WS2005-2006/Kryptologie_1/tabellen.pdf) |
| **Lange Komposita** | Silbentrennung ist Pflicht. Liang-Algorithmus mit TeX-Mustern (`de-1996` = neue Rechtschreibung). Deutsche Muster ≈ 81 KB (Englisch ≈ 27 KB). | [Hyphenopoly](https://github.com/mnater/Hyphenopoly), [hyphen (npm)](https://github.com/ytiurin/hyphen) |
| Pangramm mit Umlauten und ß | z. B. „Victor jagt zwölf Boxkämpfer quer über den großen Sylter Deich“ als Startsatz der Probe. | – |

## 6. Fonts statt Engine? (OpenType)

Gelesen: Tutorials/Forenbeiträge ([High-Logic](https://www.high-logic.com/font-editor/fontcreator/tutorials/creating-handwritten-fonts-with-contextual-alternates),
[Type Network](https://typenetwork.com/articles/opentype-at-work-contextual-alternates), [TypeDrawers](https://typedrawers.com/discussion/comment/67455)).

- Pseudo-Zufall in Schriften geht praktisch nur über **`calt`** (Varianten im Kreis 1-2-3-1-2-3); `rand` wird kaum unterstützt.
- Schon 2–3 Varianten nehmen die meiste sichtbare Wiederholung weg, aber: Kontext bricht oft an Wortgrenzen, gleiche Wörter
  sehen gleich aus, keine Drift, keine Verformung.
- **Fazit:** Als zusätzlicher Export sinnvoll (eigene Schrift in Word/Pages/GoodNotes nutzen), als Hauptweg zu starr.

## 7. Abstände wie Schriftgestalter: HT Letterspacer

Gelesen: Projektseite/README ([GitHub](https://github.com/huertatipografica/HTLetterspacer)). Setzt Seitenabstände nach der
**weißen Fläche** neben einem Zeichen (in einem Höhenband, mit Tiefenbegrenzung), nicht nach der engsten Stelle. Passt als
Ersatz für unseren reinen Mindestabstand (A8).

## 8. Messen statt raten

- **Lesbarkeit:** deutscher Handschrift-Erkenner, z. B. [fhswf/TrOCR_german_handwritten](https://huggingface.co/fhswf/TrOCR_german_handwritten)
  (Modellkarte: Zeichenfehlerrate 4,1 % auf seinem Testset). Gerenderte Zeilen erkennen lassen → Zeichenfehlerrate als Lesbarkeitsmaß.
  Steigt sie nach einer Änderung, ist die Schrift schlechter lesbar geworden.
- **Stil-Ähnlichkeit:** HWD (Pippi et al., BMVC 2023, [arXiv](https://arxiv.org/abs/2310.20316), [Code](https://github.com/aimagelab/hwd))
  vergleicht Bilder echter und erzeugter Schrift im Merkmalsraum eines Handschrift-Netzes; besser als FID für diesen Zweck.
- **Blindtest:** echte und erzeugte Zeilen gemischt zeigen, raten lassen (so validiert auch Haines).

## 9. Neuronale Verfahren – warum (noch) nicht

| Verfahren | Problem für uns |
|---|---|
| Graves-RNN ([sjvasquez/handwriting-synthesis](https://github.com/sjvasquez/handwriting-synthesis)) | Englischer Zeichensatz ohne Umlaute/ß; deutsche Gewichte nicht gefunden. |
| VATr (Pippi et al., CVPR 2023, [Paper](https://openaccess.thecvf.com/content/CVPR2023/papers/Pippi_Handwritten_Text_Generation_From_Visual_Archetypes_CVPR_2023_paper.pdf)) | Kann seltene Zeichen über Unifont-„Archetypen“ erzeugen (interessant für Umlaute), liefert aber **Pixelbilder** von Wörtern, trainiert auf englischen Daten. |
| Diffusionsmodelle (DiffusionPen, DiffInk …) | Pixelbilder bzw. chinesische Schrift, viel Rechenaufwand, schwer ins Layout einzubauen. |

Für einen Lernzettel mit Tabellen, Kästen und Formeln ist der Glyphen-Ansatz die richtige Wahl. Neuronale Modelle wären höchstens
später interessant, um **fehlende Zeichen** im eigenen Stil zu ergänzen.

## 10. Skill oder MCP?

Gelesen: Anthropic-Blog [„Extending Claude’s capabilities with skills and MCP servers“](https://claude.com/blog/extending-claude-capabilities-with-skills-mcp-servers).

- **Skill** = Vorgehenswissen („wie macht man X“): Anleitung + Skripte + Vorlagen, wird bei Bedarf geladen; Agent Skills sind ein offener Standard.
- **MCP** = Zugang zu externen Systemen und Live-Daten („Claude soll auf X zugreifen“).
- Zitat sinngemäß: Erklärt man, *wie* etwas geht → Skill; braucht Claude *Zugriff* auf etwas → MCP. Gute Setups kombinieren beides.

- **Beide sind offen, nicht nur Claude:** Agent Skills wurden am 18.12.2025 als offener Standard veröffentlicht
  ([agentskills.io](https://agentskills.io/)); laut Berichten nutzen sie u. a. Codex, GitHub Copilot, Cursor, Gemini CLI.
  MCP-Server laufen u. a. in Claude, ChatGPT, Cursor, VS Code/Copilot und Zed ([Übersicht](https://contextbolt.com/blog/ai-tools-mcp-support/);
  Unterstützung ist je Programm unterschiedlich vollständig, z. B. nur entfernte Server oder nur im Entwicklermodus).

Entscheidung daraus: siehe [entscheidungen.md](entscheidungen.md#2-cli-mcp-server-oder-skill).

## 11. Bearbeitbare digitale Tinte

Gelesen: nur Suchzusammenfassungen und Projektseiten (nicht die vollständigen Formatbeschreibungen).

| Ziel | Fakt | Quelle |
|---|---|---|
| GoodNotes | Dateiformat ist nicht veröffentlicht; Nutzer fordern ein offenes Format, um bearbeitbare Notizen erzeugen zu können; Versuche, es nachzubauen (2020), blieben unvollständig. → penclone kann **keine bearbeitbare GoodNotes-Tinte** erzeugen. Das Lasso kopiert Handschrift nur zwischen GoodNotes-Seiten. | [Goodnotes-Feedback](https://feedback.goodnotes.com/forums/191274-customer-suggestions-for-goodnotes/suggestions/40953457-open-data-format-for-goodnotes), [Goodnotes-Support: Lasso](https://support.goodnotes.com/hc/en-us/articles/10779441732111-Edit-and-reflow-handwriting-with-the-Lasso-tool) |
| Notability | `.note` wurde nachgebaut (binäre plist) – geht also pro App, kostet aber jedes Mal eigene Arbeit. | [Julia Evans 2018](https://jvns.ca/blog/2018/03/31/reverse-engineering-notability-format/) |
| InkML | W3C-Empfehlung (2011) zum Austausch digitaler Tinte zwischen Programmen. | [W3C InkML](https://www.w3.org/TR/2011/REC-InkML-20110920/) |
| OneNote | Ink-API (Beta 2017) gibt Tinte als InkML aus und nimmt sie an. Heutiger Stand nicht geprüft. | [Microsoft-365-Dev-Blog](https://devblogs.microsoft.com/microsoft365dev/onenote-ink-beta-apis/) |
| Xournal++ | `.xopp` = gzip-komprimiertes XML, im Kern das Xournal-`.xoj`-Format; Striche bleiben bearbeitbar. | [xournalpp](https://github.com/xournalpp/xournalpp) |
| Excalidraw | Szenen sind JSON; Freihandlinien sind `freedraw`-Elemente mit Punktlisten, im Web (auch Safari am iPad) bearbeitbar. Hier nicht neu geprüft. | [excalidraw](https://github.com/excalidraw/excalidraw) |

## 12. Öffentliche Handschriftdaten für einen ersten Test der Regeln (P5, Stufe 1)

Gelesen: nur Datensatz-Seiten und Suchzusammenfassungen (Stand 16.11.2026). Lizenzen und Dateiformate vor der Nutzung auf den
offiziellen Seiten prüfen. Daten aus diesen Sätzen kommen nie in dieses Repository; nur Auswertungsskripte, und jede Person lädt
die Daten selbst herunter.

| Datensatz | Inhalt | Bedingungen (wie gefunden) | Nutzen für penclone |
|---|---|---|---|
| [IAM On-Line Handwriting DB (IAM-OnDB)](https://fki.tic.heia-fr.ch/databases/iam-on-line-handwriting-database) | Englische Zeilen, Stiftbahnen, viele Schreiber | Frei für nicht-kommerzielle Forschung, Registrierung nötig ([Download](https://fki.tic.heia-fr.ch/databases/download-the-iam-on-line-handwriting-database)) | Statistiken zu Grundlinie, x-Höhe, Punkten aus echten Strichen |
| [DeepWriting](https://www.github.com/emreaksan/deepwriting) (Aksan et al., CHI 2018) | 294 Schreiber, 85.181 Wörter, segmentiert, `.npz` | Basiert auf IAM-OnDB: IAM-Registrierung und Zitierpflicht; Lizenz der Projektseite nicht geprüft | Striche auf Wort- und Zeichenebene ohne eigene Segmentierung |
| [CVL Database](https://cvl.tuwien.ac.at/research/cvl-databases/an-off-line-database-for-writer-retrieval-writer-identification-and-word-spotting/) | Scans (300 dpi), etwa 310 Schreiber, 1 deutscher und 6 englische Texte | Angegeben als CC BY-NC 3.0; volle Bedingungen nicht geprüft | Einzige Offline-Quelle mit deutschem Text; Bilder, Zeichen müssten ausgeschnitten werden |
| [IAM Handwriting DB](https://fki.tic.heia-fr.ch/databases/iam-handwriting-database) | Englische Textzeilen als Bilder | Registrierung, nicht-kommerziell | Nur Bilder, keine Striche |

Grenzen:

- Die Sätze enthalten abgeschriebenen Text, keine Musterblätter. Getestet werden die **Größen- und Positionsstatistiken** der
  Regeln (R1–R4), nicht das Blattlayout. R5 (verwechselbare Varianten) braucht mehrere Varianten je Zeichen desselben
  Schreibers, die die Sätze nur für häufige Buchstaben liefern.
- Die Schreiber kopieren einen vorgegebenen Text; Nutzer von penclone schreiben Sätze für das Musterblatt. Unterschiede sind zu
  erwarten.
- Stufe 1 (öffentliche Daten) zeigt, ob die Regeln plausibel sind. Stufe 2 (Freiwillige, `penclone validate`) bleibt nötig, weil
  nur sie den echten Eingabeweg von penclone misst.

### Ergebnis Stufe 1 (IAM-OnDB, 16.11.2026, `tools/iam_validate.py`)

144 von 197 Schreibern hatten genug verwertbare Wörter (alle Zahlen je Schreiber, relativ zur eigenen x-Höhe; Zeichen sind
nicht den Strichen zugeordnet, deshalb dienen Wörter mit bekannten höchsten/tiefsten Buchstaben, siehe
`pipeline/validate_stats.py`):

| Statistik | Schreiber | 5 % / Median / 95 % | Vergleich |
|---|---|---|---|
| Oberlänge / x-Höhe | 144 | 1,31 / 1,58 / 2,06 | Autor von penclone: 1,5–1,6 (passt) |
| Großbuchstabe / x-Höhe | 48 | 1,44 / 1,81 / 2,43 | Autor: etwa 1,5 (am kurzen Ende; nur 48 Schreiber mit genug Wörtern) |
| Tiefster Punkt unter der Grundlinie, 95. Perzentil, Wörter ohne Unterlänge (in x-Höhen) | 144 | 0,18 / 0,27 / 0,43 | R3 erlaubt etwa 0,14 (0,06 em bei x-Höhe 0,42 em) |

Lesart: Groß- und Oberlängen-Verhältnisse des ersten Schreibers liegen im Bereich der IAM-Schreiber. Die R3-Toleranz ist
**enger** als der Überhang der meisten IAM-Schreiber; die Messung enthält aber Fehler durch Wort-Trennung und Grundlinien-Fit,
und IAM ist überwiegend verbundene Schrift. Das ist also **noch kein Beleg gegen R3**, sondern zeigt, dass R3 mit Daten auf
Zeichenebene geprüft werden muss, bevor es auf Schreiber mit verbundener Schrift angewendet wird (geplant, P5).

## 13. Zeilen-Gewohnheiten aus der eigenen Probe gemessen

Woher das Zeilenmodell der Engine (P2) seine Zahlen hat – Belegart 2 der Belege-Regel. `pipeline/measure_layout.py` liest das
geschriebene Probeblatt v2 (ein bekannter Satz pro Linie) und schreibt `layout.json` ins Profil; die Engine nimmt das als
Standardwerte. Alle Längen in x-Höhen des Schreibers.

| Größe | Verfahren | Hinweis |
|---|---|---|
| Wortabstand | Weißraum zwischen der Tinte benachbarter Wörter; Wörter über die k−1 breitesten Lücken einer Zeile mit k Wörtern. Eine Zeile zählt nur, wenn jedes Wort ab 3 Buchstaben eine plausible Breite pro Buchstabe hat (0,5–2× Zeilen-Median). | Tinte zu Tinte, genau so setzt die Engine Wörter |
| Lage und Schräge der Grundlinie | Unterkante jedes Zeichen-Clusters (≥ ½ x-Höhe; Unterlängen raus, wenn > 0,3 x-Höhen unter dem Median der 9 nächsten Cluster), verglichen mit der Linie; Geraden-Fit pro Zeile | |
| Drift | Reste nach dem Geraden-Fit, aufgeteilt in **Zittern pro Buchstabe** und **langsame Drift** mit einem exponentiellen Variogramm γ(h) = Nugget + Sill·(1 − e^(−h/Reichweite)), angepasst an Matherons Schätzer über alle Zeilen | die exponentielle Kovarianz gehört zu einem Ornstein-Uhlenbeck-Prozess (Zufallslauf, der zur Linie zurückgezogen wird – das stetige Gegenstück zum Kalman-Modell bei Haines et al.). Die Glyphen behalten das Zittern der Buchstaben, aus denen sie stammen; die Engine fügt nur die Drift hinzu. |

Erster Schreiber (migl06, 34 Zeilen, x-Höhe 2,33 mm): Wortabstand Median 1,45 (Quartile 1,22–1,81, 159 Lücken aus 19 Zeilen);
Schrift sitzt 0,23 über der Linie; Schräge −0,10° ± 0,25°; Zittern sd 0,14, Drift sd 0,15 mit Korrelationslänge 4,2 x-Höhen.

Grenzen: Das Blatt legt Zeilenanfang und Zeilenabstand fest; Zeilenanfang, Zeilenabstand und Ränder sind darauf nicht messbar und
bleiben Annahmen. Eine erste Version glättete die Grundlinie mit dem Median über 9 Cluster und maß danach die Korrelationslänge;
die ≈ 6 x-Höhen waren die Fensterbreite der Glättung, nicht die des Schreibers – deshalb das Variogramm.

Verwendete Verfahren, für dieses Projekt nicht neu gelesen (Standard): Liangs Silbentrennung (F. M. Liang, *Word Hy-phen-a-tion
by Com-put-er*, Stanford 1983) mit den hyph-utf8-Mustern `de-1996` (gelesen: Dateikopf – MIT-Lizenz, Version 28.02.2024,
36.709 Muster); Linienvereinfachung nach Ramer–Douglas–Peucker (Ramer 1972; Douglas & Peucker 1973), Toleranz 0,02 mm;
Ornstein-Uhlenbeck-Prozess und Matherons Variogramm-Schätzer.
