import { zipSync, strToU8 } from 'fflate';
import { jsPDF } from 'jspdf';
import { t, currentLang } from './i18n';
// @ts-ignore
import { PRECAMBRIAN_EONS } from './utils';

// ==========================================
// 1. EXPORT EXCEL (.xlsx)
// ==========================================
export type XlsxCol = { title: string; width: number };

const xmlEsc = (v: any): string =>
    String(v ?? '')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const colLetter = (i: number): string => {
    let s = '';
    i += 1;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
};

const u8ToBase64 = (u8: Uint8Array): string => {
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < u8.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + CHUNK)) as any);
    }
    return btoa(bin);
};

const buildXlsx = (sheetName: string, cols: XlsxCol[], rows: { v: string, italic?: boolean }[][]): Uint8Array => {
    const nCols = cols.length;
    const lastCol = colLetter(nCols - 1);
    const nRows = rows.length + 1;
    const safeSheet = (sheetName || 'Data').replace(/[\\\/\?\*\[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31).trim() || 'Data';

    const colsXml = cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`).join('');
    const headXml = '<row r="1" ht="26" customHeight="1">' + cols.map((c, i) => `<c r="${colLetter(i)}1" s="1" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c.title)}</t></is></c>`).join('') + '</row>';
    
    const bodyXml = rows.map((r, ri) => {
        const cells = r.map((cell, ci) => {
            const txt = xmlEsc(cell.v);
            if (txt === '') return '';
            return `<c r="${colLetter(ci)}${ri + 2}" s="${cell.italic ? 3 : 2}" t="inlineStr"><is><t xml:space="preserve">${txt}</t></is></c>`;
        }).join('');
        return `<row r="${ri + 2}">${cells}</row>`;
    }).join('');

    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastCol}${nRows}"/><sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${colsXml}</cols><sheetData>${headXml}${bodyXml}</sheetData><autoFilter ref="A1:${lastCol}${nRows}"/></worksheet>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font><font><i/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E5A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD9D9D9"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(safeSheet)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
    const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

    return zipSync({
        '[Content_Types].xml': strToU8(contentTypes),
        '_rels/.rels': strToU8(rootRels),
        'xl/workbook.xml': strToU8(workbook),
        'xl/_rels/workbook.xml.rels': strToU8(wbRels),
        'xl/styles.xml': strToU8(styles),
        'xl/worksheets/sheet1.xml': strToU8(sheet)
    }, { level: 6 });
};

export const saveExcelFile = async (title: string, cols: XlsxCol[], rows: any[], electronAPI: any) => {
    try {
        const zip = buildXlsx(title, cols, rows);
        const uri = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + u8ToBase64(zip);
        const res = await electronAPI.saveExport(uri, `export_${title || 'data'}.xlsx`, 'xlsx');
        if (res && res.success === false && !res.canceled) throw new Error(res.error || 'saveExport failed');
    } catch (err) {
        console.error('XLSX export failed:', err);
        alert(t('alert.xlsx_error'));
    }
};

// ==========================================
// 2. EXPORT GRAPHIQUE ARBRE EN PDF
// ==========================================
export const exportGraphToPdf = (b64Image: string, fileName: string, electronAPI: any) => {
    const img = new Image(); 
    img.src = b64Image;
    img.onload = async () => {
        const orientation = img.width > img.height ? 'landscape' : 'portrait'; 
        const doc = new jsPDF({ orientation: orientation, unit: 'mm', format: 'a4' });
        const pdfWidth = doc.internal.pageSize.getWidth(); 
        const pdfHeight = doc.internal.pageSize.getHeight(); 
        const ratio = Math.min(pdfWidth / img.width, pdfHeight / img.height);
        const xOffset = (pdfWidth - (img.width * ratio)) / 2; 
        const yOffset = (pdfHeight - (img.height * ratio)) / 2;
        doc.addImage(b64Image, 'PNG', xOffset, yOffset, img.width * ratio, img.height * ratio); 
        const pdfDataUri = doc.output('datauristring');
        electronAPI.saveExport(pdfDataUri, fileName, 'pdf');
    };
};

// ==========================================
// 3. EXPORT FICHE TAXON EN PDF
// ==========================================
export const generateFichePdf = async (d: any, settings: any, lineageStr: string, synNameStr: string, geoDetails: any[], electronAPI: any) => {
    const doc = new jsPDF(); 
    
    let frameColor = settings.ficheColor;
    const r = parseInt(frameColor.slice(1, 3), 16);
    const g = parseInt(frameColor.slice(3, 5), 16);
    const b = parseInt(frameColor.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    const textColor = brightness < 128 ? 255 : 0;

    let y = 20;
    const boxW = 170; 
    
    doc.setFont('times', d.isItalic ? 'italic' : 'bold');
    doc.setFontSize(22);
    const displayName = (d.extinct ? '\u2020 ' : '') + (d.name || t('default.unnamed_taxon'));
    const splitName = doc.splitTextToSize(displayName, boxW - 10);
    let boxH = 6 + (splitName.length * 8); 
    
    let authorDate = [];
    if (d.author && d.author.trim() !== '') authorDate.push(d.author);
    if (d.discoveryDate && d.discoveryDate.trim() !== '') authorDate.push(d.discoveryDate);
    
    let splitAuthor: string[] = [];
    if (authorDate.length > 0) {
        doc.setFont('times', 'italic');
        doc.setFontSize(12);
        splitAuthor = doc.splitTextToSize(authorDate.join(', '), boxW - 10);
        boxH += splitAuthor.length * 5;
    }

    if (synNameStr !== '') {
        boxH += 7;
    }
    
    boxH += 4;

    doc.setFillColor(r, g, b);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(20, y, boxW, boxH, 'FD');
    doc.setTextColor(textColor);
    
    let textY = y + 10;
    doc.setFont('times', d.isItalic ? 'italic' : 'bold');
    doc.setFontSize(22);
    doc.text(splitName, 25, textY);
    textY += (splitName.length * 8);

    if (splitAuthor.length > 0) {
        doc.setFont('times', 'italic');
        doc.setFontSize(12);
        doc.text(splitAuthor, 25, textY - 2);
        textY += (splitAuthor.length * 5);
    }

    if (synNameStr !== '') {
        doc.setFont('times', 'italic');
        doc.setFontSize(14);
        doc.setTextColor(33, 150, 243);
        doc.text(synNameStr, 25, textY - 1);
    }

    y += boxH + 10;
    doc.setTextColor(0, 0, 0);
    doc.setFont('times', 'normal');

    if (d.sheetImage && d.sheetImageRatio) {
        const maxWidth = 170; 
        const maxHeight = 80; 
        let imgW = maxWidth;
        let imgH = imgW / d.sheetImageRatio;

        if (imgH > maxHeight) {
            imgH = maxHeight;
            imgW = imgH * d.sheetImageRatio;
        }

        if (y + imgH > 275) { doc.addPage(); y = 20; }
        
        const imgX = 20 + (maxWidth - imgW) / 2; 
        const formatStr = d.sheetImage.substring(d.sheetImage.indexOf('/') + 1, d.sheetImage.indexOf(';')).toUpperCase();
        const safeFormat = formatStr === 'JPEG' || formatStr === 'JPG' ? 'JPEG' : 'PNG';
        
        doc.addImage(d.sheetImage, safeFormat, imgX, y, imgW, imgH);
        y += imgH + 3;

        if (d.imgCredits && d.imgCredits.trim() !== '') {
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150); 
            doc.setFont('times', 'italic');
            const textWidth = doc.getTextWidth(d.imgCredits);
            doc.text(d.imgCredits, 20 + (maxWidth - textWidth) / 2, y + 2); 
            doc.setFont('times', 'normal');
            doc.setTextColor(0, 0, 0); 
            y += 6;
        } else {
            y += 4;
        }
        y += 6;
    }

    doc.setFontSize(11);
    let periodFormatted = d.period || '';
    periodFormatted = periodFormatted.replace(/Cambrien/gi, 'C').replace(/Précambrien/gi, 'PréC').replace(/\uA792/g, 'C');
    
    if (periodFormatted.trim() !== '') {
        doc.setFont('times', 'bold'); doc.text(`${t('label.period')} :`, 20, y); doc.setFont('times', 'normal');
        doc.text(periodFormatted, 55, y);
        y += 8;
    }

    if (settings.pdfTimeline) {
        if (y > 250) { doc.addPage(); y = 20; } 
        const startX = 20; const timelineWidth = 170; const timelineHeight = 8;
        doc.setFontSize(7); doc.setLineWidth(0.1);
        
        const parseMa = (s: string) => parseFloat(s.replace(',', '.'));
        let pStart: number | null = null; 
        let pEnd: number | null = null;
        
        if (d.period) {
            const rangeMatch = d.period.match(/([\d.,]+)\s*-\s*([\d.,]+)/);
            if (rangeMatch) {
                pStart = parseMa(rangeMatch[1]); pEnd = parseMa(rangeMatch[2]);
            } else {
                const singleMatch = d.period.match(/([\d.,]+)/);
                if (singleMatch) { pStart = parseMa(singleMatch[1]); pEnd = pStart; }
            }
        }

        if (pStart !== null && pEnd !== null && !isNaN(pStart) && !isNaN(pEnd) && pStart < pEnd) { 
            const temp = pStart; pStart = pEnd; pEnd = temp; 
        }

        const isDeepPrecambrian = (pStart !== null && pStart > 541) || (pEnd !== null && pEnd > 541);

        if (isDeepPrecambrian) {
            PRECAMBRIAN_EONS.forEach((p: any) => {
                const pctWidth = ((p.start - p.end) / 4500) * timelineWidth;
                const pctLeft = ((4500 - p.start) / 4500) * timelineWidth;
                const pr = parseInt(p.color.substring(1,3), 16); const pg = parseInt(p.color.substring(3,5), 16); const pb = parseInt(p.color.substring(5,7), 16);
                
                doc.setFillColor(pr, pg, pb);
                doc.rect(startX + pctLeft, y, pctWidth, timelineHeight, 'FD');
                doc.setTextColor(255, 255, 255);
                if (pctWidth > 4) { doc.setFont('times', 'bold'); doc.text(p.abbr, startX + pctLeft + (pctWidth/2) - 1.5, y + 5.5); }
            });

            if (pStart !== null && pEnd !== null && !isNaN(pStart) && !isNaN(pEnd)) {
                const iStart = Math.min(4500, Math.max(0, pStart)); const iEnd = Math.min(4500, Math.max(0, pEnd));
                const iWidth = pStart === pEnd ? 0 : ((iStart - iEnd) / 4500) * timelineWidth;
                const iLeft = ((4500 - iStart) / 4500) * timelineWidth;
                doc.setDrawColor(255, 0, 0); 
                if (pStart === pEnd) {
                    doc.setLineWidth(0.5); doc.line(startX + iLeft, y, startX + iLeft, y + timelineHeight); 
                } else {
                    doc.setLineWidth(0.8); doc.line(startX + iLeft, y + timelineHeight, startX + iLeft + iWidth, y + timelineHeight); 
                }
                doc.setDrawColor(0,0,0); doc.setLineWidth(0.1); 
            }
        } else {
            const periods = [
                { abbr: "PréC", start: 600, end: 541, hex: "F08080" }, { abbr: "C", start: 541, end: 485, hex: "99C68E" },
                { abbr: "O", start: 485, end: 443, hex: "009270" }, { abbr: "S", start: 443, end: 419, hex: "B3E1B6" },
                { abbr: "D", start: 419, end: 358, hex: "CB8C37" }, { abbr: "C", start: 358, end: 298, hex: "67A599" },
                { abbr: "P", start: 298, end: 252, hex: "F04028" }, { abbr: "T", start: 252, end: 201, hex: "812B92" },
                { abbr: "J", start: 201, end: 145, hex: "34B2C9" }, { abbr: "K", start: 145, end: 66, hex: "7FC64E" },
                { abbr: "Pg", start: 66, end: 23, hex: "FD9A52" }, { abbr: "Ng", start: 23, end: 2.5, hex: "FFE619" },
                { abbr: "Q", start: 2.5, end: 0, hex: "F9F97F" }
            ];

            periods.forEach(p => {
                const pctWidth = ((p.start - p.end) / 600) * timelineWidth;
                const pctLeft = ((600 - p.start) / 600) * timelineWidth;
                const pr = parseInt(p.hex.substring(0,2), 16); const pg = parseInt(p.hex.substring(2,4), 16); const pb = parseInt(p.hex.substring(4,6), 16);
                
                doc.setFillColor(pr, pg, pb);
                doc.rect(startX + pctLeft, y, pctWidth, timelineHeight, 'FD');
                doc.setTextColor(0,0,0);
                if (pctWidth > 4) { doc.setFont('times', 'normal'); doc.text(p.abbr, startX + pctLeft + (pctWidth/2) - 1.5, y + 5.5); }
            });

            if (pStart !== null && pEnd !== null && !isNaN(pStart) && !isNaN(pEnd)) {
                const iStart = Math.min(600, Math.max(0, pStart)); const iEnd = Math.min(600, Math.max(0, pEnd));
                const iWidth = pStart === pEnd ? 0 : ((iStart - iEnd) / 600) * timelineWidth;
                const iLeft = ((600 - iStart) / 600) * timelineWidth;
                doc.setDrawColor(255, 0, 0); 
                if (pStart === pEnd) {
                    doc.setLineWidth(0.5); doc.line(startX + iLeft, y, startX + iLeft, y + timelineHeight); 
                } else {
                    doc.setLineWidth(0.8); doc.line(startX + iLeft, y + timelineHeight, startX + iLeft + iWidth, y + timelineHeight); 
                }
                doc.setDrawColor(0,0,0); doc.setLineWidth(0.1); 
            }
        }

        if (!isDeepPrecambrian && pStart !== null && pEnd !== null && !isNaN(pStart) && !isNaN(pEnd)) {
            const intersectingPeriods = geoDetails.filter(p => (pStart! > p.end && pEnd! < p.start));
            if (intersectingPeriods.length > 0 && intersectingPeriods.length <= 2) {
                y += timelineHeight + 4; 
                intersectingPeriods.sort((a, b) => b.start - a.start);
                const zoomStart = intersectingPeriods[0].start;
                const zoomEnd = intersectingPeriods[intersectingPeriods.length - 1].end;
                const zoomDuration = zoomStart - zoomEnd;
                
                intersectingPeriods.forEach((period) => {
                    period.subs.forEach((sub: any, i: number) => {
                        const subDuration = sub.s - sub.e;
                        const subWidth = (subDuration / zoomDuration) * timelineWidth;
                        const subLeft = ((zoomStart - sub.s) / zoomDuration) * timelineWidth;
                        
                        const shadeAmount = (i / Math.max(1, period.subs.length - 1)) * 40 - 20;
                        let hex = period.color.replace(/^\s*#|\s*$/g, '');
                        if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
                        let pr = parseInt(hex.substring(0, 2), 16); let pg = parseInt(hex.substring(2, 4), 16); let pb = parseInt(hex.substring(4, 6), 16);
                        if (shadeAmount > 0) {
                            pr = pr + Math.round((255 - pr) * (shadeAmount / 100)); pg = pg + Math.round((255 - pg) * (shadeAmount / 100)); pb = pb + Math.round((255 - pb) * (shadeAmount / 100));
                        } else {
                            pr = pr + Math.round(pr * (shadeAmount / 100)); pg = pg + Math.round(pg * (shadeAmount / 100)); pb = pb + Math.round(pb * (shadeAmount / 100));
                        }

                        doc.setFillColor(pr, pg, pb);
                        doc.setDrawColor(0,0,0); doc.setLineWidth(0.1);
                        doc.rect(startX + subLeft, y, subWidth, timelineHeight, 'FD');
                        
                        if (subWidth > 8) {
                            doc.setTextColor(0, 0, 0); doc.setFontSize(6);
                            const stageName = t(sub.k); 
                            const textW = doc.getTextWidth(stageName);
                            if (textW < subWidth - 1) doc.text(stageName, startX + subLeft + (subWidth - textW) / 2, y + 5.5);
                        }
                    });
                });

                const zDisplayStart = Math.min(zoomStart, Math.max(zoomEnd, pStart!));
                const zDisplayEnd = Math.min(zoomStart, Math.max(zoomEnd, pEnd!));
                const zWidth = pStart === pEnd ? 0 : ((zDisplayStart - zDisplayEnd) / zoomDuration) * timelineWidth;
                const zLeft = ((zoomStart - zDisplayStart) / zoomDuration) * timelineWidth;

                doc.setDrawColor(255, 0, 0); 
                if (pStart === pEnd) {
                    doc.setLineWidth(0.5); doc.line(startX + zLeft, y, startX + zLeft, y + timelineHeight); 
                } else {
                    doc.setLineWidth(0.8); doc.line(startX + zLeft, y + timelineHeight, startX + zLeft + zWidth, y + timelineHeight); 
                }
                doc.setDrawColor(0,0,0); doc.setLineWidth(0.1); 
            }
        }
        y += timelineHeight + 10; 
    }

    doc.setFontSize(11);
    const addLine = (label: string, text: string) => {
      if (text && text.trim() !== '') {
        if (y > 275) { doc.addPage(); y = 20; }
        doc.setFont('times', 'bold'); doc.text(label, 20, y); doc.setFont('times', 'normal');
        const cleanText = text.replace(/<[^>]+>/g, '');
        const splitText = doc.splitTextToSize(cleanText, 130); 
        doc.text(splitText, 55, y); 
        y += 6 * splitText.length + 2;
      }
    };

    if (d.status && d.status !== 'Valide' && d.status !== '') {
        doc.setFont('times', 'bold');
        if (d.status === 'Synonyme') { doc.text(`= ${t('status.synonym')}`, 20, y); } 
        else { doc.text(`${t('label.status')} : ${t('data.' + d.status.toLowerCase()) !== ('data.' + d.status.toLowerCase()) ? t('data.' + d.status.toLowerCase()) : d.status}`, 20, y); }
        doc.setFont('times', 'normal');
        y += 8;
    }

    addLine(`${t('label.rank')} :`, d.rank); 
    addLine(`${t('label.dist')} :`, d.distribution); 
    addLine(`${t('label.size')} :`, d.size); 
    addLine(`${t('label.mass')} :`, d.mass); 
    if (!d.extinct && d.iucn && d.iucn.trim() !== '') { addLine(`${t('label.iucn')} :`, d.iucn); }
    y += 4;

    const addTextBlock = (title: string, text: string) => {
        if (text && text.trim() !== '') {
            if (y > 260) { doc.addPage(); y = 20; }
            doc.setFont('times', 'bold'); doc.text(title, 20, y); doc.setFont('times', 'normal'); y += 6;
            const splitText = doc.splitTextToSize(text.replace(/<[^>]+>/g, ''), 170);
            doc.text(splitText, 20, y);
            y += 6 * splitText.length + 6;
        }
    };

    addTextBlock(`${t('label.diagnose')} :`, d.diagnose);
    addTextBlock(`${t('label.synapo')} :`, d.synapomorphies);
    addTextBlock(`${t('label.notes')} :`, d.notes);

    const addBiblioBlock = (title: string, text: string) => {
        if (text && text.trim() !== '') {
            if (y > 260) { doc.addPage(); y = 20; }
            doc.setFont('times', 'bold'); doc.text(title, 20, y); doc.setFont('times', 'normal'); y += 6;
            
            const lines = text.split('\n');
            lines.forEach((line: string) => {
                const splitLine = doc.splitTextToSize(line.replace(/<[^>]+>/g, ''), 170);
                splitLine.forEach((l: string) => {
                    if (y > 280) { doc.addPage(); y = 20; }
                    const urlMatch = l.match(/(https?:\/\/[^\s]+)/);
                    if (urlMatch) {
                        doc.setTextColor(33, 150, 243); 
                        doc.textWithLink(l, 20, y, { url: urlMatch[0] });
                        doc.setTextColor(0, 0, 0); 
                    } else { doc.text(l, 20, y); }
                    y += 6;
                });
            });
            y += 6;
        }
    };

    addBiblioBlock(`${t('label.biblio')} :`, d.biblio);

    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFontSize(8); doc.setTextColor(150);
    const splitLineage = doc.splitTextToSize(t('pdf.lineage') + lineageStr, 170); 
    doc.text(splitLineage, 20, y);
    y += 6 * splitLineage.length + 3;

    doc.setFont('times', 'italic');
    doc.text(currentLang === 'en' ? "Generated by CladisTree" : "Créé avec CladisTree", 20, y);

    const pdfDataUri = doc.output('datauristring');
    await electronAPI.saveExport(pdfDataUri, `fiche_${d.name || 'taxon'}.pdf`, 'pdf');
};