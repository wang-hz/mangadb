import { readingProgressController } from '@/controller/reading-progress.controller';
import { MangadbController } from '@/controller/mangadb.controller';
import { requireAdmin } from '@/middleware/auth';
import { Router } from 'express';

const router = Router();
const mangadbController = new MangadbController();

// The assertion prevents an old browser tab's queue from following a changed cookie.
router.use('/reading-progress', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.vary('X-MangaDB-User');
  const expectedUser = req.get('X-MangaDB-User');
  if (expectedUser && expectedUser !== req.user?.uuid) {
    res.status(403).json({ error: 'Reading progress session changed' }); return;
  }
  next();
});
router.get('/reading-progress', readingProgressController.list);
router.get('/reading-progress/:uuid', readingProgressController.get);
router.post('/reading-progress', readingProgressController.submit);

router.get('/mangas', mangadbController.getMangasByPage);
router.get('/mangas/:uuid', mangadbController.getMangaByUuid);
router.patch('/mangas/:uuid', requireAdmin, mangadbController.updateManga);
router.get('/mangas/:uuid/folder-files', requireAdmin, mangadbController.getMangaFolderFiles);
router.put('/mangas/:uuid/pages', requireAdmin, mangadbController.updateMangaPages);
router.post('/mangas/:uuid/tags', requireAdmin, mangadbController.createMangaTags);
router.delete('/mangas/:uuid/tags/:tagUuid', requireAdmin, mangadbController.deleteMangaTag);
router.get('/tags/:uuid/mangas', mangadbController.getMangasByTagUuid);
router.post('/tags/:uuid/batch-add-tag', requireAdmin, mangadbController.batchAddTagToMangasByTag);
router.post('/tags/:uuid/batch-set-publish-date', requireAdmin, mangadbController.batchSetPublishDateByTag);
router.patch('/tags/:uuid', requireAdmin, mangadbController.updateTag);
router.delete('/tags/:uuid', requireAdmin, mangadbController.deleteTag);
router.get('/tags/:uuid', mangadbController.getTagByUuid);
router.get('/tags', mangadbController.getTagsByPage);
router.post('/tags', requireAdmin, mangadbController.createTag);
router.get('/tag_types', mangadbController.getTagTypesByPage);

export default router;
