const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/properties/:id/values', async (req, res) => {
  const propertyId = parseInt(req.params.id);
  try {
    const values = await prisma.propertyValue.findMany({
      where: { propertyId },
      orderBy: { displayValue: 'asc' },
    });
    res.json(values);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/property-values', async (req, res) => {
  const { displayValue, name, sku, description, propertyId } = req.body;
  if (!displayValue || !name || !sku || !propertyId) {
    return res.status(400).json({ error: 'displayValue, name, sku, propertyId are required' });
  }
  try {
    const value = await prisma.propertyValue.create({
      data: {
        displayValue,
        name,
        sku,
        description: description || null,
        propertyId: parseInt(propertyId),
      },
    });
    res.status(201).json(value);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/property-values/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { displayValue, name, sku, description } = req.body;
  try {
    const value = await prisma.propertyValue.update({
      where: { id },
      data: {
        ...(displayValue && { displayValue }),
        ...(name && { name }),
        ...(sku && { sku }),
        ...(description !== undefined && { description }),
      },
    });
    res.json(value);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'PropertyValue not found' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/property-values/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await prisma.propertyValue.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'PropertyValue not found' });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
