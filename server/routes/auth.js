import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { getDb } from '../db/database.js';
import { promisifyDb } from '../db/utils.js';
import { sendOTP, generateOTP } from '../utils/email.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Register
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').optional().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, name } = req.body;
      const db = getDb();
      const { get, run } = promisifyDb(db);

      // Check if user exists in main table
      const existingUser = await get('SELECT id FROM users WHERE email = ?', [email]);
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      const otp = generateOTP();
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Check if user exists in pending table
      const existingPendingUser = await get('SELECT email FROM pending_users WHERE email = ?', [email]);

      if (existingPendingUser) {
        // Update existing pending user
        await run(
          'UPDATE pending_users SET password = ?, name = ?, otp_code = ?, otp_expires_at = ? WHERE email = ?',
          [hashedPassword, name || null, otp, otpExpiresAt.toISOString(), email]
        );
      } else {
        // Create new pending user
        await run(
          'INSERT INTO pending_users (email, password, name, otp_code, otp_expires_at) VALUES (?, ?, ?, ?, ?) RETURNING email',
          [email, hashedPassword, name || null, otp, otpExpiresAt.toISOString()]
        );
      }

      await sendOTP(email, otp);

      res.status(201).json({
        message: 'OTP sent to email',
        email
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Verify OTP
router.post(
  '/verify-otp',
  [
    body('email').isEmail().normalizeEmail(),
    body('otp').isLength({ min: 6, max: 6 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, otp } = req.body;
      const db = getDb();
      const { get, run } = promisifyDb(db);

      // Check pending users
      const pendingUser = await get('SELECT * FROM pending_users WHERE email = ?', [email]);

      if (!pendingUser) {
        return res.status(400).json({ error: 'Invalid or expired registration request' });
      }

      if (pendingUser.otp_code !== otp) {
        return res.status(400).json({ error: 'Invalid OTP' });
      }

      if (new Date(pendingUser.otp_expires_at) < new Date()) {
        return res.status(400).json({ error: 'OTP expired' });
      }

      // Move to users table
      const result = await run(
        'INSERT INTO users (email, password, name, is_verified) VALUES (?, ?, ?, 1)',
        [pendingUser.email, pendingUser.password, pendingUser.name]
      );

      // Remove from pending_users
      await run('DELETE FROM pending_users WHERE email = ?', [email]);

      // Log them in
      const token = jwt.sign({ userId: result.lastID }, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
      });

      res.json({
        message: 'Verification successful',
        token,
        user: {
          id: result.lastID,
          email: pendingUser.email,
          name: pendingUser.name,
        },
      });

    } catch (error) {
      console.error('Verification error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;
      const db = getDb();
      const { get } = promisifyDb(db);

      // Find user
      const user = await get('SELECT * FROM users WHERE email = ?', [email]);
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      // is_verified check removed as unverified users are now in pending_users

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate token
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
      });

      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Get current user
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    const { get } = promisifyDb(db);
    const user = await get('SELECT id, email, name, created_at FROM users WHERE id = ?', [decoded.userId]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

export default router;

