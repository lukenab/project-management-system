import mongoose from "mongoose";

import ActivityEventModel from "./models/activityEvent.ts";
import AuthSessionModel from "./models/authsession.ts";
import CommentModel from "./models/comment.ts";
import MembershipModel from "./models/membership.ts";
import NotificationModel from "./models/notification.ts";
import PasswordResetTokenModel from "./models/passwordresettoken.ts";
import ProjectModel from "./models/project.ts";
import RegistrationRequestModel from "./models/registrationrequest.ts";
import SprintModel from "./models/sprint.ts";
import SystemAuditEventModel from "./models/systemAuditEvent.ts";
import UserModel from "./models/user.ts";
import WorkItemModel from "./models/workitem.ts";
import { hashPassword } from "./services/auth.ts";
import { MONGODB_URI } from "./utils/config.ts";
import logger from "./utils/logger.ts";

const DEFAULT_PASSWORD = "Password@123";

function addDays(base: Date, days: number) {
  const result = new Date(base);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function toDateOnlyString(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function resolveMongoUri() {
  if (process.env.NODE_ENV !== "production") {
    try {
      const dotenv = await import("dotenv");
      dotenv.config();
    } catch {
      // Ignore if dotenv is not installed in production image
    }
  }
  return (
    process.env.MONGODB_URI ||
    process.env.TEST_MONGODB_URI ||
    MONGODB_URI ||
    "mongodb://127.0.0.1:27017/project_management_dev"
  );
}

async function seed() {
  const uri = await resolveMongoUri();
  logger.info(`[seed] connecting to ${uri}`);
  await mongoose.connect(uri);

  logger.info("[seed] clearing existing collections...");
  await Promise.all([
    NotificationModel.deleteMany({}),
    CommentModel.deleteMany({}),
    ActivityEventModel.deleteMany({}),
    SystemAuditEventModel.deleteMany({}),
    WorkItemModel.deleteMany({}),
    SprintModel.deleteMany({}),
    MembershipModel.deleteMany({}),
    ProjectModel.deleteMany({}),
    AuthSessionModel.deleteMany({}),
    PasswordResetTokenModel.deleteMany({}),
    RegistrationRequestModel.deleteMany({}),
    UserModel.deleteMany({}),
  ]);

  const now = new Date();
  const yesterday = addDays(now, -1);
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);

  logger.info("[seed] creating demo user accounts...");
  const [adminUser, poUser, smUser, devUser, suspendedUser] =
    await UserModel.create([
      {
        email: "admin@pms.local",
        passwordHash,
        fullName: "Nguyen Quoc Khanh (Admin)",
        emailVerifiedAt: now,
        systemRole: "SYSTEM_ADMINISTRATOR",
        status: "ACTIVE",
      },
      {
        email: "po@pms.local",
        passwordHash,
        fullName: "Nguyen An Binh (PO)",
        emailVerifiedAt: now,
        systemRole: "STAFF",
        status: "ACTIVE",
      },
      {
        email: "sm@pms.local",
        passwordHash,
        fullName: "Tran Cong Luan (SM)",
        emailVerifiedAt: now,
        systemRole: "STAFF",
        status: "ACTIVE",
      },
      {
        email: "dev@pms.local",
        passwordHash,
        fullName: "Nguyen Tan Trung (Dev)",
        emailVerifiedAt: now,
        systemRole: "STAFF",
        status: "ACTIVE",
      },
      {
        email: "suspended@pms.local",
        passwordHash,
        fullName: "Suspended Account Demo",
        emailVerifiedAt: yesterday,
        systemRole: "STAFF",
        status: "SUSPENDED",
        suspendedAt: yesterday,
      },
    ]);

  logger.info("[seed] creating projects and memberships...");
  const [ecomProject, archivedProject] = await ProjectModel.create([
    {
      name: "E-Commerce Platform",
      key: "ECOM",
      description:
        "Multi-channel e-commerce platform with Sprint planning, backlog tracking, and payment integration.",
      status: "ACTIVE",
      workItemSequence: 9,
      workItemOrderRevision: 1,
    },
    {
      name: "Legacy Inventory System",
      key: "INV",
      description:
        "Completed warehouse inventory tracking system (archived read-only project).",
      status: "ARCHIVED",
      archivedAt: yesterday,
      workItemSequence: 0,
      workItemOrderRevision: 0,
    },
  ]);

  const [, smMembership, devMembership] = await MembershipModel.create([
    {
      userId: poUser._id,
      projectId: ecomProject._id,
      accessRole: "OWNER",
      scrumRole: "PRODUCT_OWNER",
      status: "ACTIVE",
      joinedAt: addDays(now, -25),
    },
    {
      userId: smUser._id,
      projectId: ecomProject._id,
      accessRole: "MEMBER",
      scrumRole: "SCRUM_MASTER",
      status: "ACTIVE",
      joinedAt: addDays(now, -24),
    },
    {
      userId: devUser._id,
      projectId: ecomProject._id,
      accessRole: "MEMBER",
      scrumRole: "DEVELOPER",
      status: "ACTIVE",
      joinedAt: addDays(now, -24),
    },
    {
      userId: adminUser._id,
      projectId: ecomProject._id,
      accessRole: "MEMBER",
      scrumRole: "DEVELOPER",
      status: "ACTIVE",
      joinedAt: addDays(now, -20),
    },
    {
      userId: poUser._id,
      projectId: archivedProject._id,
      accessRole: "OWNER",
      scrumRole: "PRODUCT_OWNER",
      status: "ACTIVE",
      joinedAt: addDays(now, -40),
    },
  ]);

  logger.info("[seed] creating sprints...");
  const [closedSprint, activeSprint, draftSprint] = await SprintModel.create([
    {
      projectId: ecomProject._id,
      name: "Sprint 1 - Foundation & Auth",
      goal: "Deliver JWT authentication, Google OAuth, and user profile management",
      status: "CLOSED",
      startDate: addDays(now, -21),
      endDate: addDays(now, -8),
      startedAt: addDays(now, -21),
      closedAt: addDays(now, -8),
    },
    {
      projectId: ecomProject._id,
      name: "Sprint 2 - Checkout & Sprint Board",
      goal: "Complete shopping cart UI, VNPay gateway integration, and order verification",
      status: "ACTIVE",
      startDate: addDays(now, -5),
      endDate: addDays(now, 9),
      startedAt: addDays(now, -5),
    },
    {
      projectId: ecomProject._id,
      name: "Sprint 3 - Analytics & Reporting",
      goal: "Build velocity dashboard and exportable audit reports",
      status: "DRAFT",
      startDate: addDays(now, 10),
      endDate: addDays(now, 24),
    },
  ]);

  logger.info("[seed] creating work items and subtasks...");
  const [item1, item2, item3, item4, item5, item6, item7] =
    await WorkItemModel.create([
      {
        projectId: ecomProject._id,
        key: "ECOM-1",
        sprintId: closedSprint._id,
        title: "Implement JWT authentication and Google OAuth sign-in",
        description:
          "Support email/password registration with OTP verification and Google OAuth login.",
        workType: "STORY",
        status: "DONE",
        priority: "HIGH",
        assigneeId: devMembership._id,
        startDate: toDateOnlyString(addDays(now, -20)),
        dueDate: toDateOnlyString(addDays(now, -10)),
        orderIndex: 0,
        createdBy: poUser._id,
      },
      {
        projectId: ecomProject._id,
        key: "ECOM-2",
        sprintId: activeSprint._id,
        title: "Design responsive shopping cart and checkout summary UI",
        description:
          "Build cart drawer, quantity controls, and order summary breakdown.",
        workType: "STORY",
        status: "DONE",
        priority: "HIGH",
        assigneeId: devMembership._id,
        startDate: toDateOnlyString(addDays(now, -5)),
        dueDate: toDateOnlyString(addDays(now, -1)),
        orderIndex: 0,
        createdBy: poUser._id,
      },
      {
        projectId: ecomProject._id,
        key: "ECOM-3",
        sprintId: activeSprint._id,
        title: "Integrate VNPay payment gateway and IPN webhook",
        description:
          "Generate signed payment URLs and verify IPN webhook callbacks with idempotency.",
        workType: "STORY",
        status: "IN_PROGRESS",
        priority: "HIGH",
        assigneeId: devMembership._id,
        startDate: toDateOnlyString(addDays(now, -3)),
        dueDate: toDateOnlyString(addDays(now, 5)),
        orderIndex: 1,
        createdBy: poUser._id,
      },
      {
        projectId: ecomProject._id,
        key: "ECOM-4",
        sprintId: activeSprint._id,
        title: "Fix shipping fee rounding discrepancy for express delivery",
        description:
          "Ensure currency rounding matches invoice total before redirecting to payment gateway.",
        workType: "BUG",
        status: "IN_PROGRESS",
        priority: "HIGH",
        assigneeId: smMembership._id,
        startDate: toDateOnlyString(addDays(now, -2)),
        dueDate: toDateOnlyString(addDays(now, 3)),
        orderIndex: 2,
        createdBy: smUser._id,
      },
      {
        projectId: ecomProject._id,
        key: "ECOM-5",
        sprintId: activeSprint._id,
        title: "Write end-to-end integration tests for checkout flow",
        description:
          "Cover cart validation, coupon application, and payment callback edge cases.",
        workType: "TASK",
        status: "TODO",
        priority: "MEDIUM",
        assigneeId: devMembership._id,
        startDate: toDateOnlyString(addDays(now, 1)),
        dueDate: toDateOnlyString(addDays(now, 8)),
        orderIndex: 3,
        createdBy: poUser._id,
      },
      {
        projectId: ecomProject._id,
        key: "ECOM-6",
        sprintId: draftSprint._id,
        title: "Build Sprint velocity and burndown chart widget",
        description:
          "Display completed work items and completion rate across closed sprints.",
        workType: "STORY",
        status: "TODO",
        priority: "MEDIUM",
        assigneeId: smMembership._id,
        orderIndex: 0,
        createdBy: poUser._id,
      },
      {
        projectId: ecomProject._id,
        key: "ECOM-7",
        title: "Add multi-language localization (Vietnamese & English)",
        description:
          "Provide language switcher in user profile and localize storefront labels.",
        workType: "STORY",
        status: "TODO",
        priority: "LOW",
        orderIndex: 0,
        createdBy: poUser._id,
      },
    ]);

  const [subtask1, subtask2] = await WorkItemModel.create([
    {
      projectId: ecomProject._id,
      key: "ECOM-8",
      parentId: item3._id,
      title: "Create signed payment URL generator service",
      description: "Implement HMAC-SHA512 signature for VNPay sandbox.",
      workType: "TASK",
      status: "DONE",
      priority: null,
      assigneeId: devMembership._id,
      orderIndex: 0,
      createdBy: devUser._id,
    },
    {
      projectId: ecomProject._id,
      key: "ECOM-9",
      parentId: item3._id,
      title: "Verify VNPay checksum and handle IPN callback",
      description: "Update order status atomically inside transaction.",
      workType: "TASK",
      status: "IN_PROGRESS",
      priority: null,
      assigneeId: devMembership._id,
      orderIndex: 1,
      createdBy: devUser._id,
    },
  ]);

  logger.info(
    "[seed] creating comments, activity events, and notifications...",
  );
  await CommentModel.create([
    {
      workItemId: item3._id,
      authorId: poUser._id,
      content:
        "Please make sure idempotency is handled when VNPay retries the IPN webhook.",
    },
    {
      workItemId: item3._id,
      authorId: devUser._id,
      content:
        "Payment URL generator is completed (ECOM-8). Currently testing IPN checksum verification in sandbox.",
    },
  ]);

  const [act1, act2, act3, act4, act5] = await ActivityEventModel.create([
    {
      projectId: ecomProject._id,
      actorId: poUser._id,
      workItemId: item2._id,
      actionType: "WORK_ITEM_CREATED",
      oldValue: null,
      newValue: {
        key: item2.key,
        title: item2.title,
        workType: item2.workType,
        status: "DONE",
      },
    },
    {
      projectId: ecomProject._id,
      actorId: poUser._id,
      workItemId: item3._id,
      actionType: "WORK_ITEM_CREATED",
      oldValue: null,
      newValue: {
        key: item3.key,
        title: item3.title,
        workType: item3.workType,
        status: "TODO",
      },
    },
    {
      projectId: ecomProject._id,
      actorId: devUser._id,
      workItemId: subtask1._id,
      actionType: "SUBTASK_CREATED",
      oldValue: null,
      newValue: {
        key: subtask1.key,
        title: subtask1.title,
        status: "DONE",
      },
    },
    {
      projectId: ecomProject._id,
      actorId: devUser._id,
      workItemId: subtask2._id,
      actionType: "SUBTASK_CREATED",
      oldValue: null,
      newValue: {
        key: subtask2.key,
        title: subtask2.title,
        status: "IN_PROGRESS",
      },
    },
    {
      projectId: ecomProject._id,
      actorId: devUser._id,
      workItemId: item3._id,
      actionType: "WORK_ITEM_UPDATED",
      oldValue: { status: "TODO" },
      newValue: { status: "IN_PROGRESS" },
    },
    {
      projectId: ecomProject._id,
      actorId: devUser._id,
      workItemId: item3._id,
      actionType: "COMMENT_CREATED",
      oldValue: null,
      newValue: null,
    },
  ]);

  await NotificationModel.create([
    {
      recipientId: devUser._id,
      activityEventId: act1._id,
      title: "You were assigned a work item",
      message: `${item2.key}: ${item2.title}`,
      isRead: true,
      readAt: yesterday,
    },
    {
      recipientId: devUser._id,
      activityEventId: act2._id,
      title: "You were assigned a work item",
      message: `${item3.key}: ${item3.title}`,
      isRead: false,
      readAt: null,
    },
    {
      recipientId: poUser._id,
      activityEventId: act5._id,
      title: "You were assigned a work item",
      message: `${item3.key}: ${item3.title}`,
      isRead: false,
      readAt: null,
    },
  ]);

  logger.info("[seed] creating system audit events...");
  await SystemAuditEventModel.create([
    {
      actorId: poUser._id,
      action: "PROJECT_CREATED",
      targetType: "PROJECT",
      targetId: ecomProject._id,
    },
    {
      actorId: poUser._id,
      action: "PROJECT_CREATED",
      targetType: "PROJECT",
      targetId: archivedProject._id,
    },
    {
      actorId: poUser._id,
      action: "PROJECT_ARCHIVED",
      targetType: "PROJECT",
      targetId: archivedProject._id,
    },
    {
      actorId: adminUser._id,
      action: "USER_SUSPENDED",
      targetType: "USER_ACCOUNT",
      targetId: suspendedUser._id,
      metadata: {
        reason: "Account suspended during security compliance audit",
      },
    },
  ]);

  // Suppress unused variable warnings while keeping items created
  void item1;
  void item4;
  void item5;
  void item6;
  void item7;
  void act3;
  void act4;

  logger.info(
    "===============================================================",
  );
  logger.info("[seed] DATABASE SEEDING COMPLETED SUCCESSFULLY!");
  logger.info(`[seed] Default password for all accounts: ${DEFAULT_PASSWORD}`);
  logger.info(`  1. System Admin  : ${adminUser.email} (${adminUser.fullName})`);
  logger.info(`  2. Product Owner : ${poUser.email} (${poUser.fullName})`);
  logger.info(`  3. Scrum Master  : ${smUser.email} (${smUser.fullName})`);
  logger.info(`  4. Developer     : ${devUser.email} (${devUser.fullName})`);
  logger.info(
    `  5. Suspended User: ${suspendedUser.email} (${suspendedUser.fullName})`,
  );
  logger.info(
    "===============================================================",
  );

  await mongoose.disconnect();
}

seed().catch((error: unknown) => {
  logger.error("[seed] failed to seed database:", error);
  process.exit(1);
});
