import { AuthController } from '@/controller/auth.controller';
import { requireAdmin } from '@/middleware/auth';
import { Router } from 'express';

const router = Router();
const authController = new AuthController();

router.get('/setup-status', authController.setupStatus);
router.post('/setup', authController.setup);
router.post('/login', authController.login);
router.get('/users', requireAdmin, authController.getUsers);
router.post('/users', requireAdmin, authController.createUser);
router.delete('/users/:uuid', requireAdmin, authController.deleteUser);

export default router;