# penclone render options

| Option | Values | Default |
|---|---|---|
| `--profile NAME` | handwriting profile | the only profile |
| `-o FILE` | `.pdf` `.svg` `.png` `.xopp` (Xournal++, editable) `.inkml` (editable ink) `.excalidraw` (editable) | input name + `.pdf` |
| `--paper` | `blank`, `lined`, `lined-narrow`, `lined-college`, `lined-wide`, `lin27`, `squared`, `lin22`, `lin26`, `lin28`, `dotted`, an own template, or a scan file | preference, else `blank` |
| `--output` | `paper` (pen on paper) · `ipad` (digital ink, tapered strokes) | preference, else `paper` |
| `--pen` | paper: `ballpoint`, `fineliner`, `gel`, `fountain`, `pencil` · ipad: `pen`, `pencil` | `ballpoint` / `pen` |
| `--color` | `#rrggbb` | the pen's colour |
| `--page` | `a4`, `a5`, `letter`, `WxH` (mm) | `a4`; a scan keeps its size |
| `--margin` | mm, one value or `top,right,bottom,left` | 20 |
| `--size` | x-height in mm | measured from the samples |
| `--line-spacing` | mm (blank paper; spacing of `lined`) | 8 |
| `--grid` | mm (squared / dotted) | 5 |
| `--pages N` | fit the text to N pages (smaller writing) | – |
| `--seed N` | another, equally valid version | 1 |
| `--no-hyphenation` | never split words | splits only against large gaps |

Squared and dotted paper: penclone writes on every k-th grid line so the line distance is at least the natural one.

GoodNotes / Notability cannot take generated ink (closed format): import the PDF and write on top. Editable strokes:
Xournal++ (`.xopp`), apps reading InkML, Excalidraw.

`penclone styles` lists everything, including the user's own templates.
