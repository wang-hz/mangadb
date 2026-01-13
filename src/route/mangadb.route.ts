import { MangadbController } from '@/controller/mangadb.controller';
import { Router } from 'express';

const router = Router();
const mangadbController = new MangadbController();

router.get('/mangas', mangadbController.getMangasByPage);
router.get('/tags', mangadbController.getTagsByPage);
router.get('/tag_types', mangadbController.getTagTypesByPage);

export default router;
