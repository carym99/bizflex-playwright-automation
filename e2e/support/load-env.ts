import * as path from 'path';
import { config as loadEnv } from 'dotenv';

const root = path.resolve(__dirname, '../..');
loadEnv({ path: path.join(root, '.env.local') });
loadEnv({ path: path.join(root, '.env') });
