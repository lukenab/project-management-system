import MembershipModel from "../models/membership.ts";
import ProjectModel from "../models/project.ts";

interface ProjectPayload {
  name: string;
  description: string | null;
}

const getAccessRole = async (userId: string, projectId: string) => {
  const membership = await MembershipModel.findOne({
    userId,
    projectId,
  }).lean();
  return membership?.accessRole;
};

const getMyProjects = async (userId: string) => {
  const memberships = await MembershipModel.find({ userId }).lean();
  const ids = memberships.map((membership) => membership.projectId);

  const projects = await ProjectModel.find({ _id: { $in: ids } }).sort({
    createdAt: 1,
  });

  return projects;
};

const getProject = async (userId: string, projectId: string) => {
  const accessRole = await getAccessRole(userId, projectId);
  if (accessRole === null) {
    return null;
  }

  const project = await ProjectModel.findById({ projectId });
  return project;
};

const creatProject = async (userId: string, payload: ProjectPayload) => {
  const project = new ProjectModel(payload);

  const savedProject = await project.save();

  const membership = new MembershipModel({
    userId,
    projectId: savedProject.id,
    accessRole: "OWNER",
  });
  await membership.save();

  return savedProject;
};

const updateProject = async (
  userId: string,
  projectId: string,
  payload: ProjectPayload,
) => {
  const accessRole = await getAccessRole(userId, projectId);
  if (accessRole !== "OWNER") {
    return null;
  }

  const project = await ProjectModel.findByIdAndUpdate({ projectId }, payload, {
    returnDocument: "after",
  });
  return project;
};

const archiveProject = async (userId: string, projectId: string) => {
  const accessRole = await getAccessRole(userId, projectId);
  if (accessRole !== "OWNER") {
    return null;
  }

  //TODO: Check no ACTIVE Sprint

  const project = await ProjectModel.findByIdAndUpdate(
    { projectId },
    { status: "ARCHIVE" },
    { returnDocument: "after" },
  );
  return project;
};

export default {
  getMyProjects,
  getProject,
  creatProject,
  updateProject,
  archiveProject,
};
