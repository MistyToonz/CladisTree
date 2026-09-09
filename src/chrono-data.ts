export const CHRONO_PERIOD_KEYS = [
    'geo.period.quaternary', 'geo.period.neogene', 'geo.period.paleogene',
    'geo.period.cretaceous', 'geo.period.jurassic', 'geo.period.triassic',
    'geo.period.permian', 'geo.period.carboniferous', 'geo.period.devonian',
    'geo.period.silurian', 'geo.period.ordovician', 'geo.period.cambrian',
    'geo.period.precambrian'
];

export const GEO_DETAILS = [
    { start: 2.58, end: 0, color: "#F9F97F", subs: [{k:"geo.holocene", s:0.0117, e:0}, {k:"geo.tarantian", s:0.129, e:0.0117}, {k:"geo.chibanian", s:0.774, e:0.129}, {k:"geo.calabrian", s:1.80, e:0.774}, {k:"geo.gelasian", s:2.58, e:1.80}] },
    { start: 23.03, end: 2.58, color: "#FFE619", subs: [{k:"geo.piacenzian", s:3.6, e:2.58}, {k:"geo.zanclean", s:5.33, e:3.6}, {k:"geo.messinian", s:7.25, e:5.33}, {k:"geo.tortonian", s:11.63, e:7.25}, {k:"geo.serravallian", s:13.82, e:11.63}, {k:"geo.langhian", s:15.97, e:13.82}, {k:"geo.burdigalian", s:20.44, e:15.97}, {k:"geo.aquitanian", s:23.03, e:20.44}] },
    { start: 66.0, end: 23.03, color: "#FD9A52", subs: [{k:"geo.chattian", s:27.82, e:23.03}, {k:"geo.rupelian", s:33.9, e:27.82}, {k:"geo.priabonian", s:37.8, e:33.9}, {k:"geo.bartonian", s:41.2, e:37.8}, {k:"geo.lutetian", s:47.8, e:41.2}, {k:"geo.ypresian", s:56.0, e:47.8}, {k:"geo.thanetian", s:59.2, e:56.0}, {k:"geo.selandian", s:61.6, e:59.2}, {k:"geo.danian", s:66.0, e:61.6}] },
    { start: 145.0, end: 66.0, color: "#7FC64E", subs: [{k:"geo.maastrichtian", s:72.1, e:66.0}, {k:"geo.campanian", s:83.6, e:72.1}, {k:"geo.santonian", s:86.3, e:83.6}, {k:"geo.coniacian", s:89.8, e:86.3}, {k:"geo.turonian", s:93.9, e:89.8}, {k:"geo.cenomanian", s:100.5, e:93.9}, {k:"geo.albian", s:113.0, e:100.5}, {k:"geo.aptian", s:121.4, e:113.0}, {k:"geo.barremian", s:125.77, e:121.4}, {k:"geo.hauterivian", s:132.6, e:125.77}, {k:"geo.valanginian", s:139.8, e:132.6}, {k:"geo.berriasian", s:145.0, e:139.8}] },
    { start: 201.3, end: 145.0, color: "#34B2C9", subs: [{k:"geo.tithonian", s:152.1, e:145.0}, {k:"geo.kimmeridgian", s:157.3, e:152.1}, {k:"geo.oxfordian", s:163.5, e:157.3}, {k:"geo.callovian", s:166.1, e:163.5}, {k:"geo.bathonian", s:168.3, e:166.1}, {k:"geo.bajocian", s:170.3, e:168.3}, {k:"geo.aalenian", s:174.1, e:170.3}, {k:"geo.toarcian", s:182.7, e:174.1}, {k:"geo.pliensbachian", s:190.8, e:182.7}, {k:"geo.sinemurian", s:199.3, e:190.8}, {k:"geo.hettangian", s:201.3, e:199.3}] },
    { start: 251.9, end: 201.3, color: "#812B92", subs: [{k:"geo.rhaetian", s:208.5, e:201.3}, {k:"geo.norian", s:227.0, e:208.5}, {k:"geo.carnian", s:237.0, e:227.0}, {k:"geo.ladinian", s:242.0, e:237.0}, {k:"geo.anisian", s:247.2, e:242.0}, {k:"geo.olenekian", s:251.2, e:247.2}, {k:"geo.induan", s:251.9, e:251.2}] },
    { start: 298.9, end: 251.9, color: "#F04028", subs: [{k:"geo.changhsingian", s:254.1, e:251.9}, {k:"geo.wuchiapingian", s:259.1, e:254.1}, {k:"geo.capitanian", s:265.1, e:259.1}, {k:"geo.wordian", s:268.8, e:265.1}, {k:"geo.roadian", s:272.9, e:268.8}, {k:"geo.kungurian", s:283.5, e:272.9}, {k:"geo.artinskian", s:290.1, e:283.5}, {k:"geo.sakmarian", s:293.5, e:290.1}, {k:"geo.asselian", s:298.9, e:293.5}] },
    { start: 358.9, end: 298.9, color: "#67A599", subs: [{k:"geo.gzhelian", s:303.7, e:298.9}, {k:"geo.kasimovian", s:307.0, e:303.7}, {k:"geo.moscovian", s:315.2, e:307.0}, {k:"geo.bashkirian", s:323.2, e:315.2}, {k:"geo.serpukhovian", s:330.9, e:323.2}, {k:"geo.visean", s:346.7, e:330.9}, {k:"geo.tournaisian", s:358.9, e:346.7}] },
    { start: 419.2, end: 358.9, color: "#CB8C37", subs: [{k:"geo.famennian", s:372.2, e:358.9}, {k:"geo.frasnian", s:382.7, e:372.2}, {k:"geo.givetian", s:387.7, e:382.7}, {k:"geo.eifelian", s:393.3, e:387.7}, {k:"geo.emsian", s:407.6, e:393.3}, {k:"geo.pragian", s:410.8, e:407.6}, {k:"geo.lochkovian", s:419.2, e:410.8}] },
    { start: 443.8, end: 419.2, color: "#B3E1B6", subs: [{k:"geo.pridoli", s:423.0, e:419.2}, {k:"geo.ludfordian", s:425.6, e:423.0}, {k:"geo.gorstian", s:427.4, e:425.6}, {k:"geo.homerian", s:430.5, e:427.4}, {k:"geo.sheinwoodian", s:433.4, e:430.5}, {k:"geo.telychian", s:438.5, e:433.4}, {k:"geo.aeronian", s:440.8, e:438.5}, {k:"geo.rhuddanian", s:443.8, e:440.8}] },
    { start: 485.4, end: 443.8, color: "#009270", subs: [{k:"geo.hirnantian", s:445.2, e:443.8}, {k:"geo.katian", s:453.0, e:445.2}, {k:"geo.sandbian", s:458.4, e:453.0}, {k:"geo.darriwilian", s:467.3, e:458.4}, {k:"geo.dapingian", s:470.0, e:467.3}, {k:"geo.floian", s:477.7, e:470.0}, {k:"geo.tremadocian", s:485.4, e:477.7}] },
    { start: 538.8, end: 485.4, color: "#99C68E", subs: [{k:"geo.stage10", s:489.5, e:485.4}, {k:"geo.jiangshanian", s:494.0, e:489.5}, {k:"geo.paibian", s:497.0, e:494.0}, {k:"geo.guzhangian", s:500.5, e:497.0}, {k:"geo.drumian", s:504.5, e:500.5}, {k:"geo.wuliuan", s:509.0, e:504.5}, {k:"geo.stage4", s:514.0, e:509.0}, {k:"geo.stage3", s:521.0, e:514.0}, {k:"geo.stage2", s:529.0, e:521.0}, {k:"geo.fortunian", s:538.8, e:529.0}] }
];

export function adjustColorLightness(hex: string, percent: number): string {
    hex = hex.replace(/^\s*#|\s*$/g, '');
    if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    
    if (percent > 0) {
        r = r + Math.round((255 - r) * (percent / 100));
        g = g + Math.round((255 - g) * (percent / 100));
        b = b + Math.round((255 - b) * (percent / 100));
    } else {
        r = r + Math.round(r * (percent / 100));
        g = g + Math.round(g * (percent / 100));
        b = b + Math.round(b * (percent / 100));
    }
    return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
}