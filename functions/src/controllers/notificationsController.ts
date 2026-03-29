import type { Request, Response } from "express";
import type { IDataRepository } from "../repositories/firestoreRepository";
import { COLLECTIONS } from "../config/constants";
import { sendSuccess } from "../utils/response";
import { AppError } from "../utils/errors";
import { assertLotAccess } from "../utils/access";

export function createNotificationsController(repo: IDataRepository) {
  return {
    list: async (req: Request, res: Response): Promise<void> => {
      const userId = req.authContext?.uid;
      const rows = await repo.listDocs<Record<string, unknown>>(COLLECTIONS.notifications, {
        filters: [["targetUserId", "==", userId]],
        orderBy: "createdAt",
        direction: "desc",
        limit: req.query.limit ? Number(req.query.limit) : 100
      });
      sendSuccess(
        res,
        rows.map((row: Record<string, unknown>) => ({
          ...row,
          entityRoute:
            row.linkedEntityType === "violation"
              ? `/violations/${row.linkedEntityId}`
              : row.linkedEntityType === "event"
                ? `/events/${row.linkedEntityId}`
                : null
        }))
      );
    },

    readOne: async (req: Request, res: Response): Promise<void> => {
      const notification = await repo.getDoc<Record<string, unknown>>(COLLECTIONS.notifications, String(req.params.notificationId));
      if (!notification) throw new AppError(404, "NOT_FOUND", "Notification not found");
      if (notification.targetUserId !== req.authContext?.uid) {
        throw new AppError(403, "FORBIDDEN", "Notification does not belong to the current user");
      }
      if (notification.lotId) {
        assertLotAccess(req.authContext, String(notification.lotId), "Lot scope denied");
      }
      await repo.updateDoc(COLLECTIONS.notifications, String(req.params.notificationId), {
        isRead: true,
        readAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      sendSuccess(res, { id: String(req.params.notificationId) });
    },

    readAll: async (req: Request, res: Response): Promise<void> => {
      const userId = req.authContext?.uid;
      const rows = await repo.listDocs<{ id: string }>(COLLECTIONS.notifications, {
        filters: [
          ["targetUserId", "==", userId],
          ["isRead", "==", false]
        ]
      });
      for (const row of rows) {
        await repo.updateDoc(COLLECTIONS.notifications, row.id, {
          isRead: true,
          readAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      sendSuccess(res, { updated: rows.length });
    }
  };
}
