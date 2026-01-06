import { FileController } from '@/controller/file.controller';
import { Router } from 'express';

const router = Router();
const fileController = new FileController();

router.get('/mangas/:mangaUuid', fileController.getZip);
router.get('/mangas/:mangaUuid/pages/:pageNumber', fileController.getImg);

export default router;
