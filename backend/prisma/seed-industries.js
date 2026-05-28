const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // ── CERAMIC ─────────────────────────────────────────────────────────────
  const ceramic = await prisma.industry.findFirst({ where: { name: 'Ceramic' } })
    ?? await prisma.industry.create({ data: { name: 'Ceramic', skuSeparator: '-' } });

  await seedProps(ceramic.id, [
    {
      caption: 'Product Type', skuPosition: 1, valueType: 'Manual',
      values: [
        { name: 'Floor Tile',     sku: 'FT', displayValue: 'Floor Tile',     description: 'Ceramic floor tile' },
        { name: 'Wall Tile',      sku: 'WT', displayValue: 'Wall Tile',      description: 'Ceramic wall tile' },
        { name: 'Vitrified Tile', sku: 'VT', displayValue: 'Vitrified Tile', description: 'Vitrified porcelain tile' },
        { name: 'Sanitaryware',   sku: 'SW', displayValue: 'Sanitaryware',   description: 'Ceramic sanitaryware' },
        { name: 'Tableware',      sku: 'TW', displayValue: 'Tableware',      description: 'Ceramic tableware' },
      ],
    },
    {
      caption: 'Size', skuPosition: 2, valueType: 'Manual',
      values: [
        { name: '300x300 mm',  sku: '3030', displayValue: '300x300',  description: '300x300 mm' },
        { name: '400x400 mm',  sku: '4040', displayValue: '400x400',  description: '400x400 mm' },
        { name: '600x600 mm',  sku: '6060', displayValue: '600x600',  description: '600x600 mm' },
        { name: '300x600 mm',  sku: '3060', displayValue: '300x600',  description: '300x600 mm' },
        { name: '600x1200 mm', sku: '6120', displayValue: '600x1200', description: '600x1200 mm' },
        { name: '800x800 mm',  sku: '8080', displayValue: '800x800',  description: '800x800 mm' },
      ],
    },
    {
      caption: 'Finish', skuPosition: 3, valueType: 'Manual',
      values: [
        { name: 'Glossy',   sku: 'GL', displayValue: 'Glossy',   description: 'High gloss finish' },
        { name: 'Matte',    sku: 'MT', displayValue: 'Matte',    description: 'Matte finish' },
        { name: 'Polished', sku: 'PL', displayValue: 'Polished', description: 'Mirror polished finish' },
        { name: 'Rustic',   sku: 'RU', displayValue: 'Rustic',   description: 'Rustic textured finish' },
        { name: 'Satin',    sku: 'SA', displayValue: 'Satin',    description: 'Satin semi-gloss finish' },
        { name: 'Natural',  sku: 'NT', displayValue: 'Natural',  description: 'Natural unpolished finish' },
      ],
    },
    {
      caption: 'Thickness', skuPosition: 4, valueType: 'Manual',
      values: [
        { name: '6 mm',  sku: '06', displayValue: '6mm',  description: '6mm thickness' },
        { name: '8 mm',  sku: '08', displayValue: '8mm',  description: '8mm thickness' },
        { name: '10 mm', sku: '10', displayValue: '10mm', description: '10mm thickness' },
        { name: '12 mm', sku: '12', displayValue: '12mm', description: '12mm thickness' },
      ],
    },
    {
      caption: 'Color', skuPosition: 5, valueType: 'Manual',
      values: [
        { name: 'White', sku: 'WH', displayValue: 'White', description: 'White color' },
        { name: 'Ivory', sku: 'IV', displayValue: 'Ivory', description: 'Ivory color' },
        { name: 'Beige', sku: 'BG', displayValue: 'Beige', description: 'Beige color' },
        { name: 'Grey',  sku: 'GR', displayValue: 'Grey',  description: 'Grey color' },
        { name: 'Black', sku: 'BK', displayValue: 'Black', description: 'Black color' },
        { name: 'Brown', sku: 'BR', displayValue: 'Brown', description: 'Brown color' },
        { name: 'Blue',  sku: 'BL', displayValue: 'Blue',  description: 'Blue color' },
      ],
    },
  ]);
  console.log('Ceramic seeded');

  // ── LAPTOP ──────────────────────────────────────────────────────────────
  const laptop = await prisma.industry.findFirst({ where: { name: 'Laptop' } })
    ?? await prisma.industry.create({ data: { name: 'Laptop', skuSeparator: '-' } });

  await seedProps(laptop.id, [
    {
      caption: 'Brand', skuPosition: 1, valueType: 'Manual',
      values: [
        { name: 'Dell',      sku: 'DL', displayValue: 'Dell',      description: 'Dell' },
        { name: 'HP',        sku: 'HP', displayValue: 'HP',        description: 'HP' },
        { name: 'Lenovo',    sku: 'LN', displayValue: 'Lenovo',    description: 'Lenovo' },
        { name: 'Asus',      sku: 'AS', displayValue: 'Asus',      description: 'Asus' },
        { name: 'Apple',     sku: 'AP', displayValue: 'Apple',     description: 'Apple' },
        { name: 'Acer',      sku: 'AC', displayValue: 'Acer',      description: 'Acer' },
        { name: 'Microsoft', sku: 'MS', displayValue: 'Microsoft', description: 'Microsoft Surface' },
        { name: 'Samsung',   sku: 'SG', displayValue: 'Samsung',   description: 'Samsung' },
      ],
    },
    {
      caption: 'Processor', skuPosition: 2, valueType: 'Manual',
      values: [
        { name: 'Intel Core i3', sku: 'I3', displayValue: 'Core i3',  description: 'Intel Core i3 processor' },
        { name: 'Intel Core i5', sku: 'I5', displayValue: 'Core i5',  description: 'Intel Core i5 processor' },
        { name: 'Intel Core i7', sku: 'I7', displayValue: 'Core i7',  description: 'Intel Core i7 processor' },
        { name: 'Intel Core i9', sku: 'I9', displayValue: 'Core i9',  description: 'Intel Core i9 processor' },
        { name: 'AMD Ryzen 3',   sku: 'R3', displayValue: 'Ryzen 3',  description: 'AMD Ryzen 3 processor' },
        { name: 'AMD Ryzen 5',   sku: 'R5', displayValue: 'Ryzen 5',  description: 'AMD Ryzen 5 processor' },
        { name: 'AMD Ryzen 7',   sku: 'R7', displayValue: 'Ryzen 7',  description: 'AMD Ryzen 7 processor' },
        { name: 'AMD Ryzen 9',   sku: 'R9', displayValue: 'Ryzen 9',  description: 'AMD Ryzen 9 processor' },
        { name: 'Apple M1',      sku: 'M1', displayValue: 'Apple M1', description: 'Apple M1 chip' },
        { name: 'Apple M2',      sku: 'M2', displayValue: 'Apple M2', description: 'Apple M2 chip' },
        { name: 'Apple M3',      sku: 'M3', displayValue: 'Apple M3', description: 'Apple M3 chip' },
        { name: 'Apple M4',      sku: 'M4', displayValue: 'Apple M4', description: 'Apple M4 chip' },
      ],
    },
    {
      caption: 'RAM', skuPosition: 3, valueType: 'Manual',
      values: [
        { name: '4 GB',  sku: '04R', displayValue: '4GB RAM',  description: '4GB RAM' },
        { name: '8 GB',  sku: '08R', displayValue: '8GB RAM',  description: '8GB RAM' },
        { name: '16 GB', sku: '16R', displayValue: '16GB RAM', description: '16GB RAM' },
        { name: '32 GB', sku: '32R', displayValue: '32GB RAM', description: '32GB RAM' },
        { name: '64 GB', sku: '64R', displayValue: '64GB RAM', description: '64GB RAM' },
      ],
    },
    {
      caption: 'Storage', skuPosition: 4, valueType: 'Manual',
      values: [
        { name: '256 GB SSD', sku: '256S', displayValue: '256GB SSD', description: '256GB SSD storage' },
        { name: '512 GB SSD', sku: '512S', displayValue: '512GB SSD', description: '512GB SSD storage' },
        { name: '1 TB SSD',   sku: '1TS',  displayValue: '1TB SSD',   description: '1TB SSD storage' },
        { name: '2 TB SSD',   sku: '2TS',  displayValue: '2TB SSD',   description: '2TB SSD storage' },
        { name: '1 TB HDD',   sku: '1TH',  displayValue: '1TB HDD',   description: '1TB HDD storage' },
      ],
    },
    {
      caption: 'Display Size', skuPosition: 5, valueType: 'Manual',
      values: [
        { name: '13 inch',   sku: '13D', displayValue: '13"',   description: '13-inch display' },
        { name: '13.6 inch', sku: '136', displayValue: '13.6"', description: '13.6-inch display' },
        { name: '14 inch',   sku: '14D', displayValue: '14"',   description: '14-inch display' },
        { name: '15.6 inch', sku: '156', displayValue: '15.6"', description: '15.6-inch display' },
        { name: '16 inch',   sku: '16D', displayValue: '16"',   description: '16-inch display' },
        { name: '17.3 inch', sku: '173', displayValue: '17.3"', description: '17.3-inch display' },
      ],
    },
    {
      caption: 'Category', skuPosition: 6, valueType: 'Manual',
      values: [
        { name: 'Business',    sku: 'BU', displayValue: 'Business',    description: 'Business laptop' },
        { name: 'Gaming',      sku: 'GM', displayValue: 'Gaming',      description: 'Gaming laptop' },
        { name: 'Ultrabook',   sku: 'UB', displayValue: 'Ultrabook',   description: 'Ultrabook / thin & light' },
        { name: 'Workstation', sku: 'WS', displayValue: 'Workstation', description: 'Mobile workstation' },
        { name: 'Chromebook',  sku: 'CB', displayValue: 'Chromebook',  description: 'Chromebook' },
      ],
    },
  ]);
  console.log('Laptop seeded');

  // ── MOBILE ──────────────────────────────────────────────────────────────
  const mobile = await prisma.industry.findFirst({ where: { name: 'Mobile' } })
    ?? await prisma.industry.create({ data: { name: 'Mobile', skuSeparator: '-' } });

  await seedProps(mobile.id, [
    {
      caption: 'Brand', skuPosition: 1, valueType: 'Manual',
      values: [
        { name: 'Samsung',  sku: 'SM', displayValue: 'Samsung',  description: 'Samsung' },
        { name: 'Apple',    sku: 'IP', displayValue: 'Apple',    description: 'Apple iPhone' },
        { name: 'OnePlus',  sku: 'OP', displayValue: 'OnePlus',  description: 'OnePlus' },
        { name: 'Xiaomi',   sku: 'MI', displayValue: 'Xiaomi',   description: 'Xiaomi' },
        { name: 'Oppo',     sku: 'OV', displayValue: 'Oppo',     description: 'Oppo' },
        { name: 'Vivo',     sku: 'VV', displayValue: 'Vivo',     description: 'Vivo' },
        { name: 'Realme',   sku: 'RE', displayValue: 'Realme',   description: 'Realme' },
        { name: 'Google',   sku: 'GP', displayValue: 'Google',   description: 'Google Pixel' },
        { name: 'Motorola', sku: 'MO', displayValue: 'Motorola', description: 'Motorola' },
        { name: 'Nokia',    sku: 'NK', displayValue: 'Nokia',    description: 'Nokia' },
      ],
    },
    {
      caption: 'Storage', skuPosition: 2, valueType: 'Manual',
      values: [
        { name: '32 GB',  sku: '032', displayValue: '32GB',  description: '32GB internal storage' },
        { name: '64 GB',  sku: '064', displayValue: '64GB',  description: '64GB internal storage' },
        { name: '128 GB', sku: '128', displayValue: '128GB', description: '128GB internal storage' },
        { name: '256 GB', sku: '256', displayValue: '256GB', description: '256GB internal storage' },
        { name: '512 GB', sku: '512', displayValue: '512GB', description: '512GB internal storage' },
        { name: '1 TB',   sku: '1TB', displayValue: '1TB',   description: '1TB internal storage' },
      ],
    },
    {
      caption: 'RAM', skuPosition: 3, valueType: 'Manual',
      values: [
        { name: '3 GB',  sku: '03R', displayValue: '3GB RAM',  description: '3GB RAM' },
        { name: '4 GB',  sku: '04R', displayValue: '4GB RAM',  description: '4GB RAM' },
        { name: '6 GB',  sku: '06R', displayValue: '6GB RAM',  description: '6GB RAM' },
        { name: '8 GB',  sku: '08R', displayValue: '8GB RAM',  description: '8GB RAM' },
        { name: '12 GB', sku: '12R', displayValue: '12GB RAM', description: '12GB RAM' },
        { name: '16 GB', sku: '16R', displayValue: '16GB RAM', description: '16GB RAM' },
      ],
    },
    {
      caption: 'Network', skuPosition: 4, valueType: 'Manual',
      values: [
        { name: '4G LTE', sku: '4G', displayValue: '4G', description: '4G LTE network' },
        { name: '5G',     sku: '5G', displayValue: '5G', description: '5G network' },
      ],
    },
    {
      caption: 'Color', skuPosition: 5, valueType: 'Manual',
      values: [
        { name: 'Black',  sku: 'BK', displayValue: 'Black',  description: 'Midnight Black' },
        { name: 'White',  sku: 'WH', displayValue: 'White',  description: 'Pearl White' },
        { name: 'Blue',   sku: 'BL', displayValue: 'Blue',   description: 'Blue' },
        { name: 'Gold',   sku: 'GD', displayValue: 'Gold',   description: 'Champagne Gold' },
        { name: 'Silver', sku: 'SV', displayValue: 'Silver', description: 'Titanium Silver' },
        { name: 'Green',  sku: 'GN', displayValue: 'Green',  description: 'Forest Green' },
        { name: 'Purple', sku: 'PU', displayValue: 'Purple', description: 'Lavender Purple' },
        { name: 'Red',    sku: 'RD', displayValue: 'Red',    description: 'Product Red' },
      ],
    },
  ]);
  console.log('Mobile seeded');
}

async function seedProps(industryId, propDefs) {
  for (const def of propDefs) {
    const existing = await prisma.property.findFirst({
      where: { industryId, caption: def.caption },
    });
    const prop = existing ?? await prisma.property.create({
      data: {
        industryId,
        name: def.caption,
        caption: def.caption,
        skuPosition: def.skuPosition,
        valueType: def.valueType,
        unit: def.unit || null,
        rangeMin: def.rangeMin ?? null,
        rangeMax: def.rangeMax ?? null,
      },
    });
    for (const v of def.values) {
      const ev = await prisma.propertyValue.findFirst({ where: { propertyId: prop.id, sku: v.sku } });
      if (!ev) {
        await prisma.propertyValue.create({
          data: { propertyId: prop.id, name: v.name, sku: v.sku, displayValue: v.displayValue, description: v.description },
        });
      }
    }
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
