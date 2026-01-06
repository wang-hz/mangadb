import dotenv from 'dotenv';

dotenv.config();

export const DATA_DIR = process.env.DATA_DIR || '/data';
export const PORT = Number(process.env.PORT) || 3000;
