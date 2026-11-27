import { createProject, getIdeaWithAnalysis, listProjects, updateIdea } from "@contentos/database";
import { ProjectCreate } from "@contentos/schemas";
import { api, json, parseJson } from "@/lib/api/handler";
import { requireApiSession } from "@/lib/auth";

export const GET = api(async () => {
  const { db } = await requireApiSession();
  return json({ data: await listProjects(db) });
});

export const POST = api(async ({ req }) => {
  const { db, userId } = await requireApiSession();
  const input = await parseJson(req, ProjectCreate);
  const idea = await getIdeaWithAnalysis(db, input.idea_id);
  const project = await createProject(db, userId, {
    brandId: idea.brand_id,
    ideaId: idea.id,
    title: input.title ?? idea.title,
    formats: input.formats,
  });
  if (idea.status === "inbox") await updateIdea(db, idea.id, { status: "developing" });
  return json(project, 201);
});
