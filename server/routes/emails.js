const express = require('express');
const { google } = require('googleapis');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// Build an authenticated Gmail client for the current user
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

  // Auto-save refreshed tokens
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await User.findByIdAndUpdate(userId, { accessToken: tokens.access_token });
    }
  });

  return { gmail: google.gmail({ version: 'v1', auth: oauth2Client }), user };
}

// Decode base64url email body
function decodeBody(data) {
  if (!data) return '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// Extract plain text body from a Gmail message payload
function extractBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBody(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }
  return '';
}

// Get header value by name
function getHeader(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

// Fetch list of emails (inbox or important)
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

    // Fetch metadata for each message (fast — no body yet)
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

    // Get original to extract headers
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
      requestBody: {
        raw: encoded,
        threadId: original.data.threadId,
      },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Send reply error:', err);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

module.exports = router;
