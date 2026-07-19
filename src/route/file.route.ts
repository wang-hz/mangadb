import { FileController } from '@/controller/file.controller';
import { requireAdmin } from '@/middleware/auth';
import { Router } from 'express';

const router = Router();
const fileController = new FileController();

router.get('/mangas/:mangaUuid', fileController.getZip);
router.get('/mangas/:mangaUuid/pages/:pageNumber', fileController.getImg);
router.get('/mangas/:mangaUuid/file/:filename', requireAdmin, fileController.getImgByFilename);

export default router;
