const express = require('express');
const { google } = require('googleapis');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

async function getGmailClient(userId) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
  });

  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await User.findByIdAndUpdate(userId, { accessToken: tokens.access_token });
    }
  });

  return { gmail: google.gmail({ version: 'v1', auth: oauth2Client }), user };
}

function decodeBody(data) {
  if (!data) return '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// Recursively collect all parts, return { plain, html }
function collectParts(payload, result = { plain: '', html: '' }) {
  if (!payload) return result;

  const mime = payload.mimeType || '';

  if (mime === 'text/plain' && payload.body?.data) {
    result.plain += decodeBody(payload.body.data);
  } else if (mime === 'text/html' && payload.body?.data) {
    result.html += decodeBody(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      collectParts(part, result);
    }
  }

  return result;
}

// Strip HTML tags to plain text, preserving whitespace/newlines
function htmlToPlain(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<\/th>/gi, ' ')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractBody(payload) {
  const { plain, html } = collectParts(payload);
  if (plain) return plain;
  if (html) return htmlToPlain(html);
  // Last resort: decode top-level body if exists
  if (payload?.body?.data) return decodeBody(payload.body.data);
  return '';
}

function getHeader(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

// Fetch list of emails
router.get('/', requireAuth, async (req, res) => {
  try {
    const { gmail } = await getGmailClient(req.session.userId);
    const { tab = 'inbox', pageToken } = req.query;

    const labelIds = tab === 'important' ? ['IMPORTANT', 'INBOX'] : ['INBOX'];

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      labelIds,
      maxResults: 20,
      ...(pageToken ? { pageToken } : {}),
    });

    const messages = listRes.data.messages || [];
    const nextPageToken = listRes.data.nextPageToken || null;

    const emails = await Promise.all(
      messages.map(async (msg) => {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });
        const h = detail.data.payload?.headers || [];
        return {
          id: msg.id,
          threadId: detail.data.threadId,
          subject: getHeader(h, 'Subject') || '(no subject)',
          from: getHeader(h, 'From'),
          date: getHeader(h, 'Date'),
          snippet: detail.data.snippet || '',
          unread: detail.data.labelIds?.includes('UNREAD') || false,
          important: detail.data.labelIds?.includes('IMPORTANT') || false,
        };
      })
    );

    res.json({ emails, nextPageToken });
  } catch (err) {
    console.error('Fetch emails error:', err);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// Get a single email's full body
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { gmail } = await getGmailClient(req.session.userId);
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: req.params.id,
      format: 'full',
    });

    const h = detail.data.payload?.headers || [];
    const body = extractBody(detail.data.payload);

    res.json({
      id: detail.data.id,
      threadId: detail.data.threadId,
      subject: getHeader(h, 'Subject') || '(no subject)',
      from: getHeader(h, 'From'),
      to: getHeader(h, 'To'),
      date: getHeader(h, 'Date'),
      body,
      snippet: detail.data.snippet || '',
      unread: detail.data.labelIds?.includes('UNREAD') || false,
    });
  } catch (err) {
    console.error('Fetch email error:', err);
    res.status(500).json({ error: 'Failed to fetch email' });
  }
});

// Send a reply
router.post('/:id/reply', requireAuth, async (req, res) => {
  try {
    const { gmail, user } = await getGmailClient(req.session.userId);
    const { replyText } = req.body;
    if (!replyText) return res.status(400).json({ error: 'No reply text' });

    const original = await gmail.users.messages.get({
      userId: 'me',
      id: req.params.id,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Message-ID', 'To'],
    });

    const h = original.data.payload?.headers || [];
    const toAddress = getHeader(h, 'From');
    const subject = getHeader(h, 'Subject');
    const messageId = getHeader(h, 'Message-ID');
    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

    const rawEmail = [
      `From: ${user.email}`,
      `To: ${toAddress}`,
      `Subject: ${replySubject}`,
      `In-Reply-To: ${messageId}`,
      `References: ${messageId}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      replyText,
    ].join('\r\n');

    const encoded = Buffer.from(rawEmail)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded, threadId: original.data.threadId },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Send reply error:', err);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

module.exports = router;