import { AuthController } from '@/controller/auth.controller';
import { requireAdmin, requireAuth } from '@/middleware/auth';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

const router = Router();
const authController = new AuthController();

router.get('/setup-status', loginLimiter, authController.setupStatus);
router.post('/setup', loginLimiter, authController.setup);
router.post('/login', loginLimiter, authController.login);
router.get('/users', requireAdmin, authController.getUsers);
router.post('/users', requireAdmin, authController.createUser);
router.delete('/users/:uuid', requireAdmin, authController.deleteUser);
router.get('/login-logs', requireAdmin, authController.getLoginLogs);
router.post('/logout', authController.logout);
router.patch('/users/:uuid/password', requireAuth, authController.changePassword);

export default router;