require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth');
const emailRoutes = require('./routes/emails');
const aiRoutes = require('./routes/ai');

const app = express();

const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,       // HTTPS only in production
    sameSite: isProd ? 'none' : 'lax',  // 'none' required for cross-domain
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

app.use('/api/auth', authRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/ai', aiRoutes);

app.get('/health', (_, res) => res.json({ ok: true }));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(process.env.PORT || 5000, () =>
      console.log(`Server running on http://localhost:${process.env.PORT || 5000}`)
    );
  })
  .catch(err => {
    console.error('MongoDB connection failed:', err);
    process.exit(1);
  });