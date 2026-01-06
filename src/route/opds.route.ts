import { OpdsController } from '@/controller/opds.controller';
import { Router } from 'express';

const router = Router();
const opdsController = new OpdsController();

router.get('/search', opdsController.search);
router.get('/catalog', opdsController.getAllTagTypes);
router.get('/tag_types/:tagType', opdsController.getTagsByTagType);
router.get('/tags/:tagUuid', opdsController.getMangasByTagUuid);
router.get('/tags', opdsController.getTagsByKeyword);
router.get('/mangas', opdsController.getMangasByKeyword);
router.get('/mangas/latest', opdsController.getLatestMangas);

export default router;
