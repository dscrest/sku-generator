const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { getAuthUrl, exchangeCode, saveOrgId } = require('../zoho/auth');
const { getOrganizations } = require('../zoho/booksApi');

const router = express.Router();
const prisma = new PrismaClient();

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';

router.get('/', (req, res) => {
  res.redirect(getAuthUrl());
});

router.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.redirect(`${FRONTEND}/connect?error=${encodeURIComponent(error)}`);
  if (!code) return res.redirect(`${FRONTEND}/connect?error=no_code`);

  try {
    await exchangeCode(code);
    const orgs = await getOrganizations();

    if (orgs.length === 1) {
      await prisma.zohoToken.update({
        where: { id: 1 },
        data: { orgId: orgs[0].organization_id, orgName: orgs[0].name },
      });
      return res.redirect(`${FRONTEND}?zoho=connected`);
    }

    // Multiple orgs — let frontend handle selection
    return res.redirect(`${FRONTEND}/connect?zoho=select_org`);
  } catch (err) {
    console.error('Zoho callback error:', err);
    res.redirect(`${FRONTEND}/connect?error=${encodeURIComponent(err.message)}`);
  }
});

router.post('/select-org', async (req, res) => {
  const { orgId, orgName } = req.body;
  if (!orgId) return res.status(400).json({ error: 'orgId required' });
  await prisma.zohoToken.update({ where: { id: 1 }, data: { orgId, orgName: orgName || null } });
  res.json({ ok: true });
});

router.get('/orgs', async (req, res) => {
  try {
    const orgs = await getOrganizations();
    res.json(orgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/status', async (req, res) => {
  try {
    const token = await prisma.zohoToken.findUnique({ where: { id: 1 } });
    res.json({
      connected: !!token?.refreshToken,
      orgId: token?.orgId || null,
      orgName: token?.orgName || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/disconnect', async (req, res) => {
  try {
    await prisma.zohoToken.deleteMany();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
