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
