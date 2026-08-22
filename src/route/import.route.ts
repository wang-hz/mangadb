import { Router } from 'express';
import multer from 'multer';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import { ImportController } from '@/controller/import.controller';
import { IMPORT_MAX_FILE_SIZE } from '@/service/import.constants';

const router = Router();
const importController = new ImportController();
const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (_req, file, cb) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, `mangadb-upload-${suffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: IMPORT_MAX_FILE_SIZE },
});

const uploadFields = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'files', maxCount: 10000 },
]);

router.post('/upload', (req, res, next) => {
  uploadFields(req, res, err => {
    const uploadedPaths = Object.values((req.files ?? {}) as Record<string, Express.Multer.File[]>)
      .flat().map(file => file.path);
    if (err instanceof multer.MulterError) {
      void Promise.all(uploadedPaths.map(filePath => fsPromises.rm(filePath, { force: true })));
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'File too large (maximum 10 GB)' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    if (err) {
      void Promise.all(uploadedPaths.map(filePath => fsPromises.rm(filePath, { force: true })));
      next(err);
      return;
    }
    importController.upload(req, res).catch(next);
  });
});

export default router;
