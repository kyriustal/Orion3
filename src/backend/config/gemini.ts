import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn('⚠️ Gemini API key is missing in environment variables');
}

export const ai = new GoogleGenAI({ apiKey: apiKey || '' });
