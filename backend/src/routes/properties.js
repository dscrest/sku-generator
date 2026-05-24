const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/industries/:id/properties', async (req, res) => {
  const industryId = parseInt(req.params.id);
  try {
    const properties = await prisma.property.findMany({
      where: { industryId },
      orderBy: { skuPosition: 'asc' },
    });
    res.json(properties);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/properties', async (req, res) => {
  const { name, caption, unit, valueType, skuPosition, industryId, rangeMin, rangeMax } = req.body;
  if (!name || !caption || !valueType || skuPosition === undefined || !industryId) {
    return res.status(400).json({ error: 'name, caption, valueType, skuPosition, industryId are required' });
  }
  try {
    const property = await prisma.property.create({
      data: {
        name,
        caption,
        unit: unit || null,
        valueType,
        skuPosition: parseInt(skuPosition),
        industryId: parseInt(industryId),
        rangeMin: rangeMin !== undefined ? parseFloat(rangeMin) : null,
        rangeMax: rangeMax !== undefined ? parseFloat(rangeMax) : null,
      },
    });
    res.status(201).json(property);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/properties/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, caption, unit, valueType, skuPosition, rangeMin, rangeMax } = req.body;
  try {
    const property = await prisma.property.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(caption && { caption }),
        ...(unit !== undefined && { unit }),
        ...(valueType && { valueType }),
        ...(skuPosition !== undefined && { skuPosition: parseInt(skuPosition) }),
        ...(rangeMin !== undefined && { rangeMin: rangeMin === null ? null : parseFloat(rangeMin) }),
        ...(rangeMax !== undefined && { rangeMax: rangeMax === null ? null : parseFloat(rangeMax) }),
      },
    });
    res.json(property);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Property not found' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/properties/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await prisma.property.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Property not found' });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
