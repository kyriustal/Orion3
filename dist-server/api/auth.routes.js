"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supabase_1 = require("../config/supabase");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || 'orion-fallback-secret-key';
// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        // Try Supabase Auth first
        const { data: authData, error: authError } = await supabase_1.supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (authError) {
            return res.status(401).json({ error: authError.message });
        }
        const user = authData.user;
        // Create JWT
        const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
            }
        });
    }
    catch (error) {
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
        const { data: authData, error: authError } = await supabase_1.supabase.auth.signUp({
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
    }
    catch (error) {
        res.status(500).json({ error: 'Server error', details: error.message });
    }
});
// Me (Get current user)
router.get('/me', auth_1.requireAuth, async (req, res) => {
    try {
        const user = req.user;
        res.json({ user });
    }
    catch (error) {
        res.status(500).json({ error: 'Server error', details: error.message });
    }
});
exports.default = router;
