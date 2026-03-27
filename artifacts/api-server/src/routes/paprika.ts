import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, paprikaCredentialsTable } from "@workspace/db";
import {
  GetPaprikaCredentialsResponse,
  SetPaprikaCredentialsBody,
  SetPaprikaCredentialsResponse,
} from "@workspace/api-zod";
import { validatePaprikaCredentials } from "../lib/paprika";

const router: IRouter = Router();

router.get("/paprika/credentials", async (_req, res): Promise<void> => {
  const [creds] = await db
    .select()
    .from(paprikaCredentialsTable)
    .limit(1);

  if (!creds) {
    res.json(GetPaprikaCredentialsResponse.parse({ configured: false, email: null }));
    return;
  }

  res.json(GetPaprikaCredentialsResponse.parse({ configured: true, email: creds.email }));
});

router.post("/paprika/credentials", async (req, res): Promise<void> => {
  const parsed = SetPaprikaCredentialsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const encryptedPassword = Buffer.from(parsed.data.password, "utf-8").toString("base64");

  const existing = await db.select().from(paprikaCredentialsTable).limit(1);

  if (existing.length > 0) {
    await db
      .update(paprikaCredentialsTable)
      .set({
        email: parsed.data.email,
        encryptedPassword,
        updatedAt: new Date(),
      })
      .where(eq(paprikaCredentialsTable.id, existing[0].id));
  } else {
    await db.insert(paprikaCredentialsTable).values({
      email: parsed.data.email,
      encryptedPassword,
    });
  }

  res.json(
    SetPaprikaCredentialsResponse.parse({ configured: true, email: parsed.data.email })
  );
});

export default router;
