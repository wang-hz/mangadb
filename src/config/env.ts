import dotenv from 'dotenv';

dotenv.config();

export const DATA_DIR = process.env.DATA_DIR || '/data';
export const PORT = Number(process.env.PORT) || 3000;
export const CORS_ORIGIN: string | string[] | false = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : false;
