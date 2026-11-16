# Allgemeine Glyphen-Regeln

English version: [../rules.md](../rules.md).

Diese Regeln stecken in der Pipeline (`pipeline/build_glyphs.py`). Sie gelten **für alle gleich**, Nutzer können sie nicht ändern,
und sie werden nur über geprüfte Pull Requests geändert. Jede Regel nennt ihre Beleg-Art
([Belege statt Raten](entscheidungen.md#5-belege-statt-raten)): **Q** = zitierte Quelle, **M** = an den eigenen Proben gemessen,
**A** = Annahme (muss noch geprüft werden, siehe P4 in [bekannte-probleme.md](bekannte-probleme.md)).

`--no-fixes` schaltet alle ab und erzeugt die rohe Pipeline-Ausgabe (zum Prüfen, dass sich sonst nichts geändert hat).

| Regel | Was sie macht | Warum | Beleg |
|---|---|---|---|
| **R1 Zeichen bleiben wie geschrieben** | Kleine Striche (i-Punkte, Doppelpunkt, Satzpunkt, …) bleiben genau so, wie sie geschrieben wurden; sie werden nie durch künstliche Punkte ersetzt. | Es ist die Handschrift des Schreibers; glyphenbasierte Synthese verwendet die eigenen Glyphen (Haines et al. 2016). Nur manche Punkte zu ersetzen ergab Mischformen (Doppelpunkt sah aus wie „°“). | Q + Nutzer-Rückmeldung |
| **R2 Umlaut-Größe** | Der Körper von ä ö ü Ä Ö Ü bekommt die mittlere Breite und Höhe der eigenen a o u A O U; Punkte/Striche behalten Größe und Abstand. | In einer eigenen Probezeile geschriebene Umlaute können deutlich größer als ihre Grundbuchstaben werden und lesen sich dann wie Großbuchstaben. | M |
| **R3 Grundlinie bei Zeichen ohne Unterlänge** | Buchstaben und Ziffern ohne Unterlänge (alle außer g j p q y f ß J Q und den Mediävalziffern 3 4 5 7 9) enden auf der Grundlinie: Ein Strich, der weiter als die Toleranz darunter reicht, wird von oben her gestaucht. Toleranz = max(0,06 em, 95. Perzentil der eigenen Überstände). | Ein einzelner Strich, der unter die Grundlinie reicht (z. B. der erste Strich eines N), kann einen Buchstaben wie einen anderen aussehen lassen (N wie „V“). Mediävalziffern 3 4 5 7 9 haben typografisch Unterlängen. | M (Toleranz) + Q (Unterlängen-Klassen) |
| **R4 ! und ? auf der Grundlinie** | Ihr tiefster Punkt kommt auf die Grundlinie. | Satzzeichen werden auf feste Höhen gesetzt, weil sie in den Probezeilen uneinheitlich stehen (machen Haines et al. 2016 genauso). | Q |
| **R5 Verwechselbare Varianten werden nicht benutzt** | Eine Variante wird übersprungen, wenn sie einer Variante eines *anderen* Zeichens fast gleicht (Chamfer-Abstand < 0,25 px bei 0,025 em pro Pixel) **und** weniger als halb so weit davon entfernt ist wie von ihren eigenen Varianten. Von einem Paar fällt die unpassendere weg, mindestens 2 Varianten bleiben immer. Groß/klein desselben Buchstabens wird nicht verglichen. | Eine Variante kann wie ein anderer Buchstabe aussehen (z. B. ein k mit Schleife wie h). Lesbarkeit geht vor. | A (Schwellen an einer Schrift eingestellt; mit einer OCR-Lesbarkeitsprüfung zu bestätigen) |

## Persönliche Ausnahmen (optional)

Ein Profil kann **Ausnahmen** (`overrides`) enthalten, für Fälle, die die allgemeinen Regeln nicht abdecken. Sie sind normalerweise
leer, werden mit Datum und Grund protokolliert und sind der letzte Ausweg, nicht der normale Weg:

```bash
python3 pipeline/profiles.py override NAME clean-dots ';!' --why "..."   # diese Zeichen bekommen künstliche Punkte
python3 pipeline/profiles.py override NAME align-cap N --why "..."       # jeder Strich geht von Grundlinie bis Versalhöhe
python3 pipeline/profiles.py block NAME k alphabet-v1:p3 --why "..."     # eine Variante nicht benutzen
```

Wenn du eine Ausnahme brauchst, mach bitte ein Issue auf: Meist fehlt dann eine allgemeine Regel.
