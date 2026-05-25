import dotenv from 'dotenv';

dotenv.config();

export const DATA_DIR = process.env.DATA_DIR || '/data';
export const PORT = Number(process.env.PORT) || 3000;
export const CORS_ORIGIN: string | string[] | false = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : false;

export const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
export const AUTH_USERNAME = process.env.AUTH_USERNAME || '';
export const AUTH_PASSWORD_HASH = process.env.AUTH_PASSWORD_HASH || '';
