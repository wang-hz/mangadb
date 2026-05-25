import { AuthController } from '@/controller/auth.controller';
import { Router } from 'express';

const router = Router();
const authController = new AuthController();

router.post('/login', authController.login);

export default router;