const http = require('http');

function post(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: 'localhost', port: 3001, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

async function addValues(propId, values) {
  for (const v of values) await post('/api/property-values', { ...v, propertyId: propId });
  console.log('  ' + values.length + ' values added');
}

async function main() {
  const industry = await post('/api/industries', { name: 'Valve', skuSeparator: '-' });
  console.log('Industry:', industry.id, industry.name);
  const iId = industry.id;

  const propDefs = [
    { name: 'Valve Type',      caption: 'Valve Type',      unit: '',   valueType: 'Manual', skuPosition: 1 },
    { name: 'Size',            caption: 'Size',             unit: 'DN', valueType: 'Manual', skuPosition: 2 },
    { name: 'Connection Type', caption: 'Connection Type',  unit: '',   valueType: 'Manual', skuPosition: 3 },
    { name: 'Pressure Rating', caption: 'Pressure Rating',  unit: '',   valueType: 'Manual', skuPosition: 4 },
    { name: 'Body Material',   caption: 'Body Material',    unit: '',   valueType: 'Manual', skuPosition: 5 },
    { name: 'Trim Material',   caption: 'Trim Material',    unit: '',   valueType: 'Manual', skuPosition: 6 },
    { name: 'Seat Material',   caption: 'Seat Material',    unit: '',   valueType: 'Manual', skuPosition: 7 },
    { name: 'O-Ring Material', caption: 'O-Ring Material',  unit: '',   valueType: 'Manual', skuPosition: 8 },
  ];

  const created = [];
  for (const p of propDefs) {
    const r = await post('/api/properties', { ...p, industryId: iId });
    created.push(r);
    console.log('Property [' + r.id + ']: ' + r.name);
  }

  const [pVT, pSZ, pCT, pPR, pBM, pTM, pST, pOR] = created;

  console.log('Valve Type...');
  await addValues(pVT.id, [
    { displayValue: 'RA - Trunnion One-Piece Ball',    name: 'Trunnion One-Piece Ball',   sku: 'RA' },
    { displayValue: 'RB - Trunnion Two-Piece Ball',    name: 'Trunnion Two-Piece Ball',   sku: 'RB' },
    { displayValue: 'RC - Trunnion Three-Piece Ball',  name: 'Trunnion Three-Piece Ball', sku: 'RC' },
    { displayValue: 'RQ - Floating Ball One-Piece',    name: 'Floating Ball One-Piece',   sku: 'RQ' },
    { displayValue: 'RR - Floating Ball Two-Piece',    name: 'Floating Ball Two-Piece',   sku: 'RR' },
    { displayValue: 'RS - Floating Ball Three-Piece',  name: 'Floating Ball Three-Piece', sku: 'RS' },
    { displayValue: 'RD - Three-Way Ball',             name: 'Three-Way Ball',            sku: 'RD' },
    { displayValue: 'RE - Four-Way Ball',              name: 'Four-Way Ball',             sku: 'RE' },
    { displayValue: 'RV - Segment Ball',               name: 'Segment Ball',              sku: 'RV' },
    { displayValue: 'PP - Globe Single Seated',        name: 'Globe Single Seated',       sku: 'PP' },
    { displayValue: 'PM - Globe Cage Single Seated',   name: 'Globe Cage Single Seated',  sku: 'PM' },
    { displayValue: 'PN - Globe Cage Double Seated',   name: 'Globe Cage Double Seated',  sku: 'PN' },
    { displayValue: 'PZ - Globe Cage Guided Single',   name: 'Globe Cage Guided',         sku: 'PZ' },
    { displayValue: 'DC - Knife Gate Standard',        name: 'Knife Gate Standard',       sku: 'DC' },
    { displayValue: 'DT - Knife Gate Through Going',   name: 'Knife Gate Through',        sku: 'DT' },
    { displayValue: 'DB - Knife Gate Funnel Type',     name: 'Knife Gate Funnel',         sku: 'DB' },
    { displayValue: 'DS - Knife Gate Double Gate',     name: 'Knife Gate Double',         sku: 'DS' },
    { displayValue: 'DF - Knife Gate Square Port',     name: 'Knife Gate Square Port',    sku: 'DF' },
    { displayValue: 'DK - Slurry Knife Gate',          name: 'Slurry Knife Gate',         sku: 'DK' },
    { displayValue: 'BW - Butterfly Valve',            name: 'Butterfly Valve',           sku: 'BW' },
  ]);

  console.log('Size...');
  await addValues(pSZ.id, [
    { displayValue: '010 - DN10 / 3/8"',    name: 'DN10',  sku: '010' },
    { displayValue: '015 - DN15 / 1/2"',    name: 'DN15',  sku: '015' },
    { displayValue: '020 - DN20 / 3/4"',    name: 'DN20',  sku: '020' },
    { displayValue: '025 - DN25 / 1"',      name: 'DN25',  sku: '025' },
    { displayValue: '032 - DN32 / 1-1/4"',  name: 'DN32',  sku: '032' },
    { displayValue: '040 - DN40 / 1-1/2"',  name: 'DN40',  sku: '040' },
    { displayValue: '050 - DN50 / 2"',      name: 'DN50',  sku: '050' },
    { displayValue: '065 - DN65 / 2-1/2"',  name: 'DN65',  sku: '065' },
    { displayValue: '080 - DN80 / 3"',      name: 'DN80',  sku: '080' },
    { displayValue: '100 - DN100 / 4"',     name: 'DN100', sku: '100' },
    { displayValue: '125 - DN125 / 5"',     name: 'DN125', sku: '125' },
    { displayValue: '150 - DN150 / 6"',     name: 'DN150', sku: '150' },
    { displayValue: '200 - DN200 / 8"',     name: 'DN200', sku: '200' },
    { displayValue: '250 - DN250 / 10"',    name: 'DN250', sku: '250' },
    { displayValue: '300 - DN300 / 12"',    name: 'DN300', sku: '300' },
    { displayValue: '350 - DN350 / 14"',    name: 'DN350', sku: '350' },
    { displayValue: '400 - DN400 / 16"',    name: 'DN400', sku: '400' },
    { displayValue: '450 - DN450 / 18"',    name: 'DN450', sku: '450' },
    { displayValue: '500 - DN500 / 20"',    name: 'DN500', sku: '500' },
    { displayValue: '600 - DN600 / 24"',    name: 'DN600', sku: '600' },
    { displayValue: '700 - DN700 / 28"',    name: 'DN700', sku: '700' },
    { displayValue: '800 - DN800 / 32"',    name: 'DN800', sku: '800' },
  ]);

  console.log('Connection Type...');
  await addValues(pCT.id, [
    { displayValue: 'F1 - RF Flanged',      name: 'RF Flanged',      sku: 'F1' },
    { displayValue: 'F2 - MF Flanged',      name: 'MF Flanged',      sku: 'F2' },
    { displayValue: 'D1 - RF Wafer',        name: 'RF Wafer',        sku: 'D1' },
    { displayValue: 'D2 - MF Wafer',        name: 'MF Wafer',        sku: 'D2' },
    { displayValue: 'L1 - RF Lugged',       name: 'RF Lugged',       sku: 'L1' },
    { displayValue: 'L2 - MF Lugged',       name: 'MF Lugged',       sku: 'L2' },
    { displayValue: 'T1 - Female Threaded', name: 'Female Threaded', sku: 'T1' },
    { displayValue: 'T2 - Male Threaded',   name: 'Male Threaded',   sku: 'T2' },
    { displayValue: 'B1 - Butt Welding',    name: 'Butt Welding',    sku: 'B1' },
    { displayValue: 'S1 - Socket Welding',  name: 'Socket Welding',  sku: 'S1' },
    { displayValue: 'P1 - Flat Welding',    name: 'Flat Welding',    sku: 'P1' },
  ]);

  console.log('Pressure Rating...');
  await addValues(pPR.id, [
    { displayValue: '04 - PN6',    name: 'PN6',    sku: '04' },
    { displayValue: '10 - PN10',   name: 'PN10',   sku: '10' },
    { displayValue: '16 - PN16',   name: 'PN16',   sku: '16' },
    { displayValue: '20 - PN20',   name: 'PN20',   sku: '20' },
    { displayValue: '25 - PN25',   name: 'PN25',   sku: '25' },
    { displayValue: '40 - PN40',   name: 'PN40',   sku: '40' },
    { displayValue: '64 - PN64',   name: 'PN64',   sku: '64' },
    { displayValue: '80 - PN100',  name: 'PN100',  sku: '80' },
    { displayValue: '90 - PN160',  name: 'PN160',  sku: '90' },
    { displayValue: '01 - 150Lb',  name: '150Lb',  sku: '01' },
    { displayValue: '03 - 300Lb',  name: '300Lb',  sku: '03' },
    { displayValue: '06 - 600Lb',  name: '600Lb',  sku: '06' },
    { displayValue: '08 - 800Lb',  name: '800Lb',  sku: '08' },
    { displayValue: '15 - 1500Lb', name: '1500Lb', sku: '15' },
    { displayValue: '21 - 2500Lb', name: '2500Lb', sku: '21' },
    { displayValue: '1K - 10K',    name: '10K',    sku: '1K' },
    { displayValue: '2K - 20K',    name: '20K',    sku: '2K' },
    { displayValue: '3K - 30K',    name: '30K',    sku: '3K' },
    { displayValue: '4K - 40K',    name: '40K',    sku: '4K' },
  ]);

  console.log('Body Material...');
  await addValues(pBM.id, [
    { displayValue: 'A - A105',           name: 'A105',        sku: 'A' },
    { displayValue: 'B - LCB',            name: 'LCB',         sku: 'B' },
    { displayValue: 'C - WCB',            name: 'WCB',         sku: 'C' },
    { displayValue: 'D - LCC',            name: 'LCC',         sku: 'D' },
    { displayValue: 'E - 321',            name: '321',         sku: 'E' },
    { displayValue: 'F - CG3M (317L)',    name: 'CG3M 317L',   sku: 'F' },
    { displayValue: 'G - CG8M (317)',     name: 'CG8M 317',    sku: 'G' },
    { displayValue: 'H - Hastelloy C',    name: 'Hastelloy C', sku: 'H' },
    { displayValue: 'J - A352 LC1',       name: 'A352 LC1',    sku: 'J' },
    { displayValue: 'K - LF2 Low Temp',   name: 'LF2',         sku: 'K' },
    { displayValue: 'L - CF3M (316L)',    name: 'CF3M 316L',   sku: 'L' },
    { displayValue: 'M - CF8M (316)',     name: 'CF8M 316',    sku: 'M' },
    { displayValue: 'N - 25#',           name: '25#',         sku: 'N' },
    { displayValue: 'P - CF8 (304)',      name: 'CF8 304',     sku: 'P' },
    { displayValue: 'Q - CF3 (304L)',     name: 'CF3 304L',    sku: 'Q' },
    { displayValue: 'S - Duplex 2205',   name: 'Duplex 2205', sku: 'S' },
    { displayValue: 'T - Titanium',       name: 'Titanium',    sku: 'T' },
    { displayValue: 'V - WCC',            name: 'WCC',         sku: 'V' },
    { displayValue: 'W - WC6',            name: 'WC6',         sku: 'W' },
    { displayValue: 'X - LF3',            name: 'LF3',         sku: 'X' },
    { displayValue: 'Z - Special',        name: 'Special',     sku: 'Z' },
  ]);

  console.log('Trim Material...');
  await addValues(pTM.id, [
    { displayValue: '10 - A105 / No Treatment',          name: 'A105 No Treatment',         sku: '10' },
    { displayValue: '11 - A105 / Hard Chrome Plating',   name: 'A105 Hard Chrome',          sku: '11' },
    { displayValue: '12 - A105 / Nickel Plating',        name: 'A105 Nickel Plating',       sku: '12' },
    { displayValue: '30 - 304 / No Treatment',           name: '304 No Treatment',          sku: '30' },
    { displayValue: '31 - 304 / Hard Chrome Plating',    name: '304 Hard Chrome',           sku: '31' },
    { displayValue: '32 - 304 / Nickel Plating',         name: '304 Nickel Plating',        sku: '32' },
    { displayValue: '33 - 304 / Nickel Hard Alloy Weld', name: '304 Nickel Alloy Weld',     sku: '33' },
    { displayValue: '34 - 304 / Tungsten Carbide Weld',  name: '304 Tungsten Carbide',      sku: '34' },
    { displayValue: '35 - 304 / Plasma Nitriding',       name: '304 Plasma Nitriding',      sku: '35' },
    { displayValue: '40 - 304L / No Treatment',          name: '304L No Treatment',         sku: '40' },
    { displayValue: '44 - 304L / Tungsten Carbide',      name: '304L Tungsten Carbide',     sku: '44' },
    { displayValue: '50 - 316 / No Treatment',           name: '316 No Treatment',          sku: '50' },
    { displayValue: '54 - 316 / Tungsten Carbide',       name: '316 Tungsten Carbide',      sku: '54' },
    { displayValue: '60 - 316L / No Treatment',          name: '316L No Treatment',         sku: '60' },
    { displayValue: '64 - 316L / Tungsten Carbide',      name: '316L Tungsten Carbide',     sku: '64' },
    { displayValue: 'T0 - Titanium / No Treatment',      name: 'Titanium',                  sku: 'T0' },
    { displayValue: 'H0 - Hastelloy C / No Treatment',   name: 'Hastelloy C',               sku: 'H0' },
    { displayValue: 'S0 - Duplex 2205 / No Treatment',   name: 'Duplex 2205',               sku: 'S0' },
    { displayValue: '19 - A105 / Ceramic Lining',        name: 'A105 Ceramic Lining',       sku: '19' },
    { displayValue: 'Z0 - Special Material',             name: 'Special Material',          sku: 'Z0' },
  ]);

  console.log('Seat Material...');
  await addValues(pST.id, [
    { displayValue: 'Y10 - Metal A105 / No Treatment',        name: 'Metal A105',                sku: 'Y10' },
    { displayValue: 'Y30 - Metal 304 / No Treatment',         name: 'Metal 304',                 sku: 'Y30' },
    { displayValue: 'Y31 - Metal 304 / Hard Chrome',          name: 'Metal 304 Hard Chrome',     sku: 'Y31' },
    { displayValue: 'Y33 - Metal 304 / Nickel Hard Alloy',    name: 'Metal 304 Nickel Alloy',    sku: 'Y33' },
    { displayValue: 'Y34 - Metal 304 / Tungsten Carbide',     name: 'Metal 304 Tungsten Carbide',sku: 'Y34' },
    { displayValue: 'Y50 - Metal 316 / No Treatment',         name: 'Metal 316',                 sku: 'Y50' },
    { displayValue: 'Y54 - Metal 316 / Tungsten Carbide',     name: 'Metal 316 Tungsten Carbide',sku: 'Y54' },
    { displayValue: 'YH0 - Metal Hastelloy C',                name: 'Metal Hastelloy C',         sku: 'YH0' },
    { displayValue: 'YT0 - Metal Titanium',                   name: 'Metal Titanium',            sku: 'YT0' },
    { displayValue: 'RP0 - Soft Seat PTFE',                   name: 'Soft PTFE',                 sku: 'RP0' },
    { displayValue: 'RP1 - Soft Seat PTFE+Glass Fibre',       name: 'Soft PTFE+Glass',           sku: 'RP1' },
    { displayValue: 'RR0 - Soft Seat RTFE',                   name: 'Soft RTFE',                 sku: 'RR0' },
    { displayValue: 'RN0 - Soft Seat NYLON',                  name: 'Soft NYLON',                sku: 'RN0' },
    { displayValue: 'RL0 - Soft Seat PPL',                    name: 'Soft PPL',                  sku: 'RL0' },
    { displayValue: 'RK0 - Soft Seat PEEK',                   name: 'Soft PEEK',                 sku: 'RK0' },
    { displayValue: 'RE0 - Soft Seat EPDM',                   name: 'Soft EPDM',                 sku: 'RE0' },
    { displayValue: 'RB0 - Soft Seat NBR',                    name: 'Soft NBR',                  sku: 'RB0' },
    { displayValue: 'RV0 - Soft Seat Viton',                  name: 'Soft Viton',                sku: 'RV0' },
    { displayValue: 'RM0 - Soft Seat Mos2',                   name: 'Soft Mos2',                 sku: 'RM0' },
  ]);

  console.log('O-Ring Material...');
  await addValues(pOR.id, [
    { displayValue: 'A - PFA (-20~230C)',   name: 'PFA',       sku: 'A' },
    { displayValue: 'E - EPDM (-40~120C)',  name: 'EPDM',      sku: 'E' },
    { displayValue: 'F - FEP (-20~160C)',   name: 'FEP',       sku: 'F' },
    { displayValue: 'R - NBR (-40~100C)',   name: 'NBR',       sku: 'R' },
    { displayValue: 'V - VITON (-20~230C)', name: 'VITON',     sku: 'V' },
    { displayValue: 'S - SR (-60~230C)',    name: 'SR',        sku: 'S' },
    { displayValue: 'W - Without O-Ring',   name: 'No O-Ring', sku: 'W' },
  ]);

  console.log('\nDone! Example: RB-050-F1-16-C-33-Y33-E');
}

main().catch(console.error);
