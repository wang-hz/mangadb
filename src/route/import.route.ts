import { Router } from 'express';
import multer from 'multer';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import { ImportController } from '@/controller/import.controller';
import { IMPORT_MAX_FILE_SIZE } from '@/service/import.constants';
import { uploadController } from '@/controller/upload.controller';
import express from 'express';

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

router.get('/uploads', (req, res) => { void uploadController.list(req, res); });
router.post('/uploads', (req, res) => { void uploadController.create(req, res); });
router.put('/uploads/:uploadId/manifest/:batchIndex', (req, res) => { void uploadController.manifestBatch(req, res); });
router.post('/uploads/:uploadId/manifest/complete', (req, res) => { void uploadController.manifestComplete(req, res); });
router.get('/uploads/:uploadId', (req, res) => { void uploadController.status(req, res); });
router.put('/uploads/:uploadId/files/:fileIndex/chunks/:chunkIndex',
  express.raw({ type: 'application/octet-stream', limit: '768kb' }),
  (req, res) => { void uploadController.chunk(req, res); });
router.post('/uploads/:uploadId/complete', (req, res) => { void uploadController.complete(req, res); });
router.delete('/uploads/:uploadId', (req, res) => { void uploadController.remove(req, res); });

export default router;
