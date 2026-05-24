const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

router.post('/generate', async (req, res) => {
  const { industryId, selectedValues } = req.body;
  if (!industryId || !selectedValues) {
    return res.status(400).json({ error: 'industryId and selectedValues are required' });
  }

  try {
    const industry = await prisma.industry.findUnique({ where: { id: parseInt(industryId) } });
    if (!industry) return res.status(404).json({ error: 'Industry not found' });

    const properties = await prisma.property.findMany({
      where: { industryId: parseInt(industryId) },
      orderBy: { skuPosition: 'asc' },
    });

    const skuParts = [];
    const nameParts = [];
    const descParts = [];

    for (const prop of properties) {
      const rawValue = selectedValues[prop.id];
      if (rawValue === undefined || rawValue === null || rawValue === '') continue;

      if (prop.valueType === 'Range') {
        const num = parseFloat(rawValue);
        if (isNaN(num)) return res.status(400).json({ error: `${prop.caption} must be a number` });
        if (prop.rangeMin !== null && num < prop.rangeMin)
          return res.status(400).json({ error: `${prop.caption} must be >= ${prop.rangeMin}` });
        if (prop.rangeMax !== null && num > prop.rangeMax)
          return res.status(400).json({ error: `${prop.caption} must be <= ${prop.rangeMax}` });
        skuParts.push(String(rawValue));
        nameParts.push(String(rawValue));
        descParts.push(`${prop.caption} ${rawValue}`);
      } else {
        const valueId = parseInt(rawValue);
        const pv = await prisma.propertyValue.findUnique({ where: { id: valueId } });
        if (!pv) return res.status(404).json({ error: `Value ${valueId} not found` });
        skuParts.push(pv.sku);
        nameParts.push(pv.name);
        descParts.push(`${prop.caption} ${pv.name}`);
      }
    }

    const sep = industry.skuSeparator || '';
    res.json({
      sku: skuParts.join(sep),
      name: nameParts.join(', '),
      description: descParts.join(' '),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/create-item', async (req, res) => {
  const { name, sku, description, type, industryId } = req.body;
  if (!name || !sku || !type || !industryId) {
    return res.status(400).json({ error: 'name, sku, type, industryId are required' });
  }
  if (!['Trading', 'Manufacturing'].includes(type)) {
    return res.status(400).json({ error: 'type must be Trading or Manufacturing' });
  }
  try {
    const item = await prisma.sKUItem.create({
      data: {
        name,
        sku,
        description: description || null,
        type,
        industryId: parseInt(industryId),
      },
    });
    res.status(201).json(item);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'SKU already exists' });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
