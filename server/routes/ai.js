const express = require('express');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

async function callGemini(prompt, temperature = 0.3) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Gemini API error');
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Summarize an email
router.post('/summarize', requireAuth, async (req, res) => {
  const { subject, from, body } = req.body;
  if (!body) return res.status(400).json({ error: 'No email body provided' });

  const prompt = `You are an email assistant. Given the email below, return a JSON object with:
- "summary": a 2-3 sentence plain English summary
- "actions": an array of specific action items the recipient needs to take (empty array if none)
- "priority": "high", "medium", or "low" based on urgency

Return ONLY valid JSON with no markdown or extra text.

From: ${from}
Subject: ${subject}

${body}`;

  try {
    const raw = await callGemini(prompt, 0.3);
    const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    res.json(JSON.parse(clean));
  } catch (err) {
    console.error('Summarize error:', err);
    res.status(500).json({ error: 'Failed to summarize email' });
  }
});

// Generate an auto-reply draft
router.post('/reply', requireAuth, async (req, res) => {
  const { subject, from, body, tone = 'professional' } = req.body;
  if (!body) return res.status(400).json({ error: 'No email body provided' });

  const toneInstructions = {
    professional: 'Write in a professional, clear, and concise tone.',
    friendly: 'Write in a warm, friendly, and conversational tone.',
    brief: 'Write a very short reply — 2-3 sentences maximum.',
  };

  const prompt = `You are an email assistant helping draft replies. ${toneInstructions[tone] || toneInstructions.professional}
Write only the body of the reply — no subject line, no "Subject:" prefix.
Do not add placeholder text like [Your Name]. End with just "Best," on its own line.
Keep it natural and human.

Draft a reply to this email:
From: ${from}
Subject: ${subject}

${body}`;

  try {
    const reply = await callGemini(prompt, 0.7);
    res.json({ reply });
  } catch (err) {
    console.error('Auto-reply error:', err);
    res.status(500).json({ error: 'Failed to generate reply' });
  }
});

module.exports = router;