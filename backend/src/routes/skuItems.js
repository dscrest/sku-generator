const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  const { industryId } = req.query;
  try {
    const items = await prisma.sKUItem.findMany({
      where: industryId ? { industryId: parseInt(industryId) } : undefined,
      include: { industry: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await prisma.sKUItem.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'SKU item not found' });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
