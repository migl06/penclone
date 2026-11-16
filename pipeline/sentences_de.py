"""German candidate sentences for sample sheet v2 and greedy selection by coverage.

All sentences were written for penclone (no third-party text, so no licence issue). They are short enough to fit on one
line of a sample sheet (<= 66 characters). Selection follows Haines et al. 2016: choose source text by the letter and
letter-pair frequency of what will be written later; the targets below are the evidence-type "assumption" part (docs/rules.md).
"""
import re
from collections import Counter

POOL = """
Zwölf Boxkämpfer jagen Viktor quer über den großen Sylter Deich.
Falsches Üben von Xylophonmusik quält jeden größeren Zwerg.
Franz jagt im komplett verwahrlosten Taxi quer durch Bayern.
Der Zug nach München fährt um 7:45 Uhr von Gleis 12 ab.
„Kommst du heute Abend?“, fragte Ben. – „Ja, gern!“
Im Jahr 2026 kostet ein Brötchen etwa 0,65 € (früher 30 Cent).
Die Prüfung beginnt am 15.12. und dauert genau 90 Minuten.
Welche Aufgaben muss ich bis Freitag erledigen?
Hinter dem Haus wächst ein alter Apfelbaum mit süßen Früchten.
Jeder Schüler schreibt seine Antwort sorgfältig in das Heft.
Der Schlüssel liegt unter dem grauen Stein neben der Tür.
Quer durch den Wald führt ein schmaler Weg zum See.
Zuerst lesen wir den Text, dann beantworten wir die Fragen.
Ein kleiner Vogel sitzt auf dem Zweig und singt ein Lied.
Nach dem Regen riecht die Luft nach Erde und frischem Gras.
Übermorgen fahren wir mit dem Fahrrad über die Brücke.
Öffnen Sie bitte das Fenster, es ist sehr warm hier.
Maßnahmen zum Schutz der Daten sind heute besonders wichtig.
Ohne ein sicheres Passwort bleibt kein Konto lange geschützt.
Die Vertraulichkeit, Integrität und Verfügbarkeit sind Schutzziele.
Ein Angreifer versucht, Schwachstellen im System auszunutzen.
Verschlüsselung macht Nachrichten für Fremde unlesbar.
Wer zuletzt lacht, lacht am besten – sagt man.
Das Wetter ist heute schön, aber morgen soll es regnen.
Hast du den Brief schon gelesen? Er liegt auf dem Tisch.
Vor dem Essen waschen wir uns immer gründlich die Hände.
Der Hund bellt laut, weil der Postbote vor dem Tor steht.
Im Winter sitzen wir gern am warmen Ofen und trinken Tee.
Peter und Paula packen zwanzig Pakete für die Reise.
Jedes Jahr im Juli verreist Jonas mit seinen Eltern ans Meer.
Katzen schlafen viel, Zebras dagegen fast nie.
Gestern haben wir 48 Kilometer geradelt und 3 Pausen gemacht.
Auf Seite 67 steht die Lösung zu Aufgabe 9 (siehe Anhang).
Die Summe von 5 + 8 = 13, und 20 % davon sind 2,6.
Bitte schicke mir die Datei bis spätestens 18 Uhr zurück.
Unsere Nachbarn haben einen großen Garten mit vielen Blumen.
Tim kauft Brot, Käse, Äpfel und ein Stück Schokolade.
Vorsicht! Die Straße ist glatt, fahre bitte langsam.
Warum ist der Himmel blau und das Gras grün?
Am Ende des Tages sind wir alle müde, aber zufrieden.
Das Quadrat hat vier gleich lange Seiten und vier rechte Winkel.
Eine Zahl ist durch 3 teilbar, wenn ihre Quersumme es ist.
Xaver zeigt Yvonne das neue Zimmer im zweiten Stock.
Qualität entsteht durch Geduld, Übung und gute Planung.
Ich schreibe mit der Hand, weil es ruhig und angenehm ist.
Der Lehrer erklärt die Regel noch einmal an der Tafel.
Für die Klausur lerne ich jeden Tag eine Stunde lang.
Zum Frühstück gibt es Müsli, Joghurt und frisches Obst.
Die Zeit vergeht schnell, wenn man etwas gern macht.
Vielen Dank für Ihre Nachricht; ich melde mich morgen.
Ein Netzwerk besteht aus Rechnern, Kabeln und Protokollen.
Ohne Schlüssel kann niemand die geheime Nachricht entziffern.
Fünf freche Füchse flitzen flink über frisches Feld.
Das Kind malt ein buntes Bild mit Sonne, Haus und Baum.
Drei Brüder bauen am Wochenende ein Boot aus Holz.
Ich wünsche dir einen schönen Tag und viel Erfolg!
Gleich nach der Schule gehen wir zusammen ins Schwimmbad.
Im Zoo gibt es Löwen, Affen, Elefanten und Pinguine.
Heute Nacht hat es zum ersten Mal in diesem Jahr geschneit.
Die Kosten betragen 125,50 € pro Person, inklusive Steuer.
Schnell packte er Zahnbürste, Socken und Jacke in den Koffer.
Welcher Weg ist kürzer: der durch den Park oder der am Fluss?
Jana, Lukas und Mia treffen sich um 14:30 Uhr am Bahnhof.
Wirklich gute Handschrift braucht Zeit, Ruhe und Platz.
Kurze Sätze helfen, ruhig und deutlich zu schreiben.
Der Zug hatte 25 Minuten Verspätung, trotzdem kamen wir an.
Mit Zucker, Mehl, Eiern und Butter backt sie einen Kuchen.
Bitte beachte: Die Abgabe ist am 31.01. um 12:00 Uhr.
Dieses Gerät arbeitet mit 230 V und verbraucht 1.500 W.
Das Ergebnis lautet x = 4, y = 7 und z = 10.
Die Katze springt vom Dach auf den Zaun und läuft weg.
Ob er wohl kommt, wenn wir ihn höflich einladen?
Hinweis: Alle Angaben ohne Gewähr; Änderungen vorbehalten.
Bei Sonnenuntergang färbt sich der ganze Horizont rot.
Zwei Dutzend Eier, ein Pfund Mehl und ein Liter Milch, bitte.
Er sagte: „Das war knapp“, und lachte laut auf.
Das Passwort wurde geändert; bitte melde dich neu an.
Gutes Material, saubere Arbeit und ein fairer Preis.
Im Sommer blühen auf der Wiese gelbe und weiße Blumen.
Ich habe 7 Äpfel, 9 Birnen und 4 Orangen gekauft.
Tschüss, bis morgen, und grüße deine Familie von mir!
Jede Jacke, jeder Joghurt und jedes Jahr hat ein Jubiläum.
Quark, Quitten und Quellwasser: Qualität zum kleinen Preis.
Xylophon, Taxi, Examen und Mixer enthalten alle ein x.
Der Yeti, ein Pony und ein Baby spielen im Keller Tennis.
Chris und Clara lernen Chemie und Cello in Cottbus.
Ost-West-Verbindung, E-Mail und Mehrwertsteuer: 19 % / 7 %.
Der Preis (inkl. Versand) liegt bei 24 € + 3 € Gebühr.
Über 60 Prozent und 8 von 10 Kindern lesen gern (Umfrage).
Österreich, Öl, Ölbild und Ökologie sind Wörter mit Ö.
Das ist ein Sonder-Angebot für Groß- und Kleinschreibung.
Rechnung: 6 · 8 = 48, 8 / 2 = 4 und 16 – 6 = 10.
""".strip().splitlines()

# Targets per character (assumptions, see docs/rules.md): frequent lower-case letters 8x, others fewer.
FREQ = 'enisratdhulcgmobwfkzpv'
PAIRS = ['er', 'en', 'ch', 'de', 'ei', 'nd', 'te', 'in', 'ie', 'ge', 'sch', 'ck', 'tz']


def targets():
    t = {}
    for c in FREQ:
        t[c] = 8
    for c in 'jqxy':
        t[c] = 4
    for c in 'äöüß':
        t[c] = 4 if c != 'ß' else 3
    for c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ':
        t[c] = 3 if c in 'DEGIKMSTWZ' else 2
    for c in '0123456789':
        t[c] = 3
    for c in '.,;:!?„“-()/%€+=–':
        t[c] = 3
    for p in PAIRS:
        t[p] = 3
    return t


def count(sentence):
    """Counter of characters and target pairs in one sentence."""
    c = Counter(ch for ch in sentence if not ch.isspace())
    for p in PAIRS:
        c[p] = len(re.findall('(?=' + p + ')', sentence))
    return c


def select(pool=POOL, lines=48, max_len=66):
    """Greedy selection: each step takes the sentence with the best gain per character, until lines is reached or nothing gains."""
    need = targets()
    chosen, have = [], Counter()
    cand = [s for s in pool if len(s) <= max_len]
    while len(chosen) < lines and cand:
        def gain(s):
            c = count(s)
            return sum(min(c[k], max(need[k] - have[k], 0)) for k in need) / len(s) ** 0.5
        best = max(cand, key=gain)
        if gain(best) <= 0:
            break
        chosen.append(best); cand.remove(best); have.update(count(best))
    return chosen, have, need


def report(chosen, have, need):
    missing = {k: (have[k], need[k]) for k in need if have[k] < need[k]}
    return missing


if __name__ == '__main__':
    ch, have, need = select()
    print(len(ch), 'sentences,', sum(len(s) for s in ch), 'characters; too long in pool:', [s for s in POOL if len(s) > 66][:3])
    miss = report(ch, have, need)
    print('below target (have, target):', miss)
