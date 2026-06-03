import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { ImportController } from '@/controller/import.controller';

const router = Router();
const importController = new ImportController();

const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (_req, file, cb) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, `mangadb-upload-${suffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage });

const uploadFields = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'files', maxCount: 1000 },
]);

router.post('/upload', (req, res, next) => {
  uploadFields(req, res, err => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err) { next(err); return; }
    importController.upload(req, res).catch(next);
  });
});

export default router;