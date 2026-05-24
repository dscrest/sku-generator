const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const industries = await prisma.industry.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(industries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { name, skuSeparator = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const industry = await prisma.industry.create({
      data: { name, skuSeparator },
    });
    res.status(201).json(industry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, skuSeparator } = req.body;
  try {
    const industry = await prisma.industry.update({
      where: { id },
      data: { ...(name && { name }), ...(skuSeparator !== undefined && { skuSeparator }) },
    });
    res.json(industry);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Industry not found' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await prisma.industry.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Industry not found' });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
