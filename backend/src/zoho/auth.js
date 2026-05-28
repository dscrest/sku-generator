const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DC = process.env.ZOHO_DC || 'com';
const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REDIRECT_URI = process.env.ZOHO_REDIRECT_URI || 'http://localhost:3001/auth/zoho/callback';

function getAuthUrl() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'ZohoBooks.fullaccess.all',
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.zoho.${DC}/oauth/v2/auth?${params}`;
}

async function exchangeCode(code) {
  const params = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  });
  const res = await fetch(`https://accounts.zoho.${DC}/oauth/v2/token`, {
    method: 'POST',
    body: params,
  });
  const data = await res.json();
  if (!data.refresh_token) throw new Error(`Zoho token exchange failed: ${JSON.stringify(data)}`);

  await prisma.zohoToken.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      refreshToken: data.refresh_token,
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
    update: {
      refreshToken: data.refresh_token,
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  });
  return data;
}

async function getAccessToken() {
  const token = await prisma.zohoToken.findUnique({ where: { id: 1 } });
  if (!token) throw new Error('Zoho not connected. Visit /auth/zoho to connect.');

  if (token.accessToken && token.expiresAt && token.expiresAt > new Date(Date.now() + 30000)) {
    return token.accessToken;
  }

  const params = new URLSearchParams({
    refresh_token: token.refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  const res = await fetch(`https://accounts.zoho.${DC}/oauth/v2/token`, {
    method: 'POST',
    body: params,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Zoho token refresh failed: ${JSON.stringify(data)}`);

  await prisma.zohoToken.update({
    where: { id: 1 },
    data: {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  });
  return data.access_token;
}

async function getOrgId() {
  const token = await prisma.zohoToken.findUnique({ where: { id: 1 } });
  return token?.orgId || process.env.ZOHO_ORG_ID;
}

async function saveOrgId(orgId) {
  await prisma.zohoToken.update({ where: { id: 1 }, data: { orgId } });
}

module.exports = { getAuthUrl, exchangeCode, getAccessToken, getOrgId, saveOrgId };
