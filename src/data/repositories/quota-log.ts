import { db } from '../db.js';
import { quotaLogs } from '../schema.js';

export const quotaLogRepo = {
  async create(data: { userId: string; tokensUsed: number; action: string }): Promise<void> {
    await db.insert(quotaLogs).values(data);
  },
};
