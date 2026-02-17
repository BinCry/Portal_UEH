import { NotificationType, Prisma, Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const normalizePayload = (payload: Prisma.JsonObject): Prisma.InputJsonValue => payload as Prisma.InputJsonValue;

export const notificationService = {
  create: async (userId: string, type: NotificationType, payload: Prisma.JsonObject) =>
    prisma.notification.create({
      data: {
        userId,
        type,
        payloadJson: normalizePayload(payload),
      },
    }),

  createForUsers: async (userIds: string[], type: NotificationType, payload: Prisma.JsonObject) => {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    if (!uniqueUserIds.length) return { count: 0 };

    return prisma.notification.createMany({
      data: uniqueUserIds.map((userId) => ({
        userId,
        type,
        payloadJson: normalizePayload(payload),
      })),
    });
  },

  createForAdmins: async (type: NotificationType, payload: Prisma.JsonObject, excludeUserId?: string) => {
    const admins = await prisma.user.findMany({
      where: {
        role: Role.ADMIN,
        status: {
          in: [UserStatus.ACTIVE, UserStatus.LOCKED],
        },
      },
      select: { id: true },
    });

    return notificationService.createForUsers(
      admins.map((admin) => admin.id).filter((id) => id !== excludeUserId),
      type,
      payload,
    );
  },

  markAllRead: async (userId: string) =>
    prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    }),

  deleteAllRead: async (userId: string) =>
    prisma.notification.deleteMany({
      where: {
        userId,
        readAt: {
          not: null,
        },
      },
    }),

  deleteReadById: async (userId: string, notificationId: string) =>
    prisma.notification.deleteMany({
      where: {
        id: notificationId,
        userId,
        readAt: {
          not: null,
        },
      },
    }),
};
