import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'orion-fallback-secret-key';

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Try Supabase Auth first
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      console.error('Falha no login Supabase:', authError.message);
      return res.status(401).json({ error: authError.message });
    }

    const user = authData.user;
    
    // Create JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name }
      }
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    res.status(201).json({
      message: 'Registration successful',
      user: authData.user
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Me (Get current user)
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.user;
    res.json({ user });
  } catch (error: any) {
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

export default router;
