<div align="center">

<img src="docs/img/logo.png" alt="CladisTree" width="110">

# CladisTree

**Draw phylogenetic trees — cladograms, phenograms and chronograms.**

[![Latest release](https://img.shields.io/github/v/release/MistyToonz/CladisTree?label=release&color=2ea44f)](https://github.com/MistyToonz/CladisTree/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/MistyToonz/CladisTree/total?color=004AAD)](https://github.com/MistyToonz/CladisTree/releases)
[![License](https://img.shields.io/github/license/MistyToonz/CladisTree)](LICENSE)
![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)

[**Download**](https://mistytoonz.github.io/CladisTree/) · [Website](https://mistytoonz.github.io/CladisTree/) · [Report an issue](https://github.com/MistyToonz/CladisTree/issues)

English · [Français](README.fr.md)

</div>

---

<img src="docs/img/chronogram-brachiosauridae.jpg" alt="Chronogram of Brachiosauridae on the geological time scale">

<div align="center"><sub><i>Brachiosauridae in chronogram mode. Each taxon sits on the geological time scale; bars show the attested stratigraphic range.</i></sub></div>

---

## What it is

CladisTree is a free desktop application for building, annotating and exporting phylogenetic trees. It is aimed at systematists, palaeontologists, students and anyone who needs a clean, publication-ready figure without fighting a general-purpose drawing program.

It is designed for large datasets: trees with thousands of taxa, a documentary record attached to every node, and export up to print resolution.

Runs on **Windows, macOS and Linux**. Free and open source, under the MIT licence. Interface available in **French and English**.

## Contents

- [Features](#features)
- [Layout modes](#layout-modes)
- [Interface](#interface)
- [Taxon records](#taxon-records)
- [Download and install](#download-and-install)
- [Getting started](#getting-started)
- [File formats](#file-formats)
- [Building from source](#building-from-source)
- [Reporting a bug](#reporting-a-bug)
- [Crediting the tool](#crediting-the-tool)
- [Licence and author](#licence-and-author)

## Features

**Three layout modes.** The same tree can be drawn as a cladogram, a phenogram (comb layout) or a chronogram. Switching between them never touches the data.

**Geological time.** The chronogram places taxa on a full stratigraphic scale — 13 periods and 100 stages, using the official ICS colours. The ribbon adjusts to your dataset, and the timeline can be bounded either to whole geological periods or to the interval your tree actually occupies. Date the root of a family and the intermediate divergences space themselves out.

**A record for every node.** Nomenclatural status, rank, author and year, distribution, size, mass, stratigraphic range, diagnosis, synapomorphies, IUCN status, synonymy and bibliography. Documented nodes are visible at a glance in the tree.

**Nomenclature handled for you.** Automatic italics, genus abbreviation (*Tyrannosaurus rex* → *T. rex*, and back), the dagger on extinct taxa, and a species counter that understands paraphyly, subspecies and duplicate genera.

**Dynamic frames.** Monophyletic or paraphyletic groups resize on their own and take in any taxon added inside them.

**Large trees.** Any clade can become its own sheet, reachable through a breadcrumb, without breaking the overall hierarchy. Trees can also link to other `.phylo` files.

**Export.** PNG and SVG up to print resolution, with a transparent or opaque background; PDF including the illustrated taxon records; CSV and XLSX for the compiled data.

**Themes.** Light, dark, sepia and InGen. Font, size, colour and icon are adjustable node by node.

## Layout modes

<table>
<tr>
<td width="50%" valign="top">

<img src="docs/img/cladogram-quetzalcoatlinae.jpg" alt="Cladogram of Quetzalcoatlinae">

**Cladogram** — branches of equal length: only the branching order is shown. The standard mode.

</td>
<td width="50%" valign="top">

<img src="docs/img/phenogram-cetacea.jpg" alt="Phenogram of Cetacea with coloured frames">

**Phenogram** — comb layout for long series of taxa: leaves line up and frames group the clades.

</td>
</tr>
</table>

**Chronogram** — branches follow the dates you enter, against the geological time scale. See the figure at the top of this page.

## Interface

<img src="docs/img/interface.png" alt="CladisTree interface: the Paleoanguimorpha tree with a taxon record open">

The tree on the left, the record of the selected taxon on the right. The tabs at the bottom split a large tree into self-contained sheets.

## Taxon records

<img src="docs/img/record-pdf.jpg" alt="Taxon record exported to PDF" width="420" align="right">

Each node carries its own documentation, filled in as you go.

Records compile into a table, export to CSV or XLSX for a spreadsheet, or to an illustrated PDF sheet carrying the full lineage and a coloured stratigraphic band.

Bibliography entries written as addresses become clickable links, both in the application and in the exported PDF.

<br clear="right">

## Download and install

Installers for the three platforms are attached to every release.

| Platform | File | |
|---|---|---|
| Windows | `.exe` installer | [Download](https://github.com/MistyToonz/CladisTree/releases/latest) |
| macOS | `.zip` archive | [Download](https://github.com/MistyToonz/CladisTree/releases/latest) |
| Linux | `.deb` package | [Download](https://github.com/MistyToonz/CladisTree/releases/latest) |

### First launch

CladisTree is not signed with a commercial code-signing certificate — these are paid, yearly, and per-platform. Both Windows and macOS will therefore warn you the first time. **The files are not damaged.**

**Windows** — if you see *“Windows protected your PC”*: click **More info**, then **Run anyway**.

**macOS** — a double-click will not work the first time:

1. Unzip the archive and move **CladisTree** to your Applications folder.
2. **Right-click** the app, then **Open**.
3. In the warning dialog, click **Open** again.

Later launches behave normally.

**Linux** — double-click the package to install it through your software centre, or use the terminal:

```bash
sudo dpkg -i cladistree_*.deb
sudo apt-get install -f    # only if dependencies are missing
```

## Getting started

1. **Start a tree.** Add a root taxon, then build downwards. A node's children are its descendants.
2. **Name your taxa.** Species written as `Genus species` are italicised automatically; extinct taxa get their dagger.
3. **Open a record.** Double-click a taxon, or right-click → *Edit record*, to fill in rank, status, dates and the rest.
4. **Add stratigraphic ranges.** Enter a period as `145 – 66` (in Ma) to place the taxon on the chronogram.
5. **Switch layout** from the toolbar: cladogram, phenogram or chronogram.
6. **Export** from the *File* menu: image, PDF, or compiled data.

Useful shortcuts: `Ctrl+S` save · `Ctrl+N` new tree · `Ctrl+F` search a taxon · `Ctrl+B` bold · `Ctrl+I` italic.

Full release notes are available in the application, under *Help → Patch notes*.

## File formats

| Extension | Use |
|---|---|
| `.phylo` | Native format (JSON). Trees can hyperlink to other `.phylo` files. |
| `.json` | Read as the native format. |
| `.xmind` | Import only — bring in an existing outline instead of retyping it. |

Files can be dropped straight onto the window.

## Building from source

Requires [Node.js](https://nodejs.org/) 20 or later.

```bash
git clone https://github.com/MistyToonz/CladisTree.git
cd CladisTree
npm install
npm start           # run in development
npm run make        # build installers for the current platform
```

The project is built with [Electron Forge](https://www.electronforge.io/) and webpack. Rendering relies on [Cytoscape.js](https://js.cytoscape.org/).

**A note on cross-platform builds.** Electron Forge only builds for the system it runs on. A `.deb` needs `fakeroot` and `dpkg`, so it cannot be produced on Windows — use WSL2 or a Linux machine. A macOS build requires macOS; there is no way around this. The reliable answer for all three is a CI pipeline: GitHub Actions runs Linux, macOS and Windows runners, and is free for public repositories.

## Reporting a bug

Open an [issue](https://github.com/MistyToonz/CladisTree/issues). Please include your operating system, the version of CladisTree (*Help → Patch notes*), and the steps that reproduce the problem. A `.phylo` file showing the issue helps a lot.

Suggestions are welcome through the same channel.

## Crediting the tool

CladisTree is free and will stay that way. If one of your figures was produced with it, a mention in the caption is always appreciated — and it is about the only way the tool gets known.

> Figure made with CladisTree (N. Ennasri).

This is a request, not a condition: the MIT licence asks for nothing of the sort.

## Licence and author

Released under the [MIT licence](LICENSE).

Created by **Nassim Ennasri**. Contact details are on the [website](https://mistytoonz.github.io/CladisTree/).
