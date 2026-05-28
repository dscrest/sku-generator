const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { createItem, updateItem } = require('../zoho/booksApi');

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

router.post('/', async (req, res) => {
  const { name, sku, description, type, industryId } = req.body;
  if (!name || !sku || !type || !industryId) {
    return res.status(400).json({ error: 'name, sku, type, industryId required' });
  }
  try {
    const item = await prisma.sKUItem.create({
      data: { name, sku, description, type, industryId: parseInt(industryId) },
      include: { industry: { select: { name: true } } },
    });

    // Push to Zoho Books — non-blocking
    pushToZoho(item).catch(err => console.error('[Zoho] push failed:', err.message));

    res.status(201).json(item);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'SKU already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, sku, description, type } = req.body;
  try {
    const item = await prisma.sKUItem.update({
      where: { id },
      data: { name, sku, description, type },
      include: { industry: { select: { name: true } } },
    });

    pushToZoho(item).catch(err => console.error('[Zoho] push failed:', err.message));

    res.json(item);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'SKU item not found' });
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

router.post('/:id/push-zoho', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const item = await prisma.sKUItem.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ error: 'SKU item not found' });
    console.log('[Zoho] manual push — sku:', item.sku, '| zohoItemId:', item.zohoItemId);
    const result = await pushToZoho(item);
    console.log('[Zoho] manual push done:', JSON.stringify(result));
    const updated = await prisma.sKUItem.findUnique({ where: { id } });
    res.json({ success: true, zohoItemId: updated.zohoItemId, item: result });
  } catch (err) {
    console.error('[Zoho] manual push error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function pushToZoho(item) {
  if (item.zohoItemId) {
    return updateItem(item.zohoItemId, item.name, item.sku);
  }
  const zohoItem = await createItem(item.name, item.sku);
  await prisma.sKUItem.update({
    where: { id: item.id },
    data: { zohoItemId: zohoItem.item_id },
  });
  return zohoItem;
}

module.exports = router;
