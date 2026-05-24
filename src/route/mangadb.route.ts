import { MangadbController } from '@/controller/mangadb.controller';
import { Router } from 'express';

const router = Router();
const mangadbController = new MangadbController();

router.get('/mangas', mangadbController.getMangasByPage);
router.get('/mangas/:uuid', mangadbController.getMangaByUuid);
router.patch('/mangas/:uuid', mangadbController.updateManga);
router.post('/mangas/:uuid/tags', mangadbController.createMangaTags);
router.delete('/mangas/:uuid/tags/:tagUuid', mangadbController.deleteMangaTag);
router.get('/tags/:uuid/mangas', mangadbController.getMangasByTagUuid);
router.post('/tags/:uuid/batch-add-tag', mangadbController.batchAddTagToMangasByTag);
router.post('/tags/:uuid/batch-set-publish-date', mangadbController.batchSetPublishDateByTag);
router.get('/tags/:uuid', mangadbController.getTagByUuid);
router.get('/tags', mangadbController.getTagsByPage);
router.post('/tags', mangadbController.createTag);
router.get('/tag_types', mangadbController.getTagTypesByPage);

export default router;
