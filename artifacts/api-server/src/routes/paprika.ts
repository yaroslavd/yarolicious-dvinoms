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

  const email = parsed.data.email.trim();
  const password = parsed.data.password.trim();
  const encryptedPassword = Buffer.from(password, "utf-8").toString("base64");

  const isValid = await validatePaprikaCredentials(email, password);
  if (!isValid) {
    res.status(400).json({ error: "Invalid Paprika credentials — please double-check your email and password." });
    return;
  }

  const existing = await db.select().from(paprikaCredentialsTable).limit(1);

  if (existing.length > 0) {
    await db
      .update(paprikaCredentialsTable)
      .set({
        email,
        encryptedPassword,
        updatedAt: new Date(),
      })
      .where(eq(paprikaCredentialsTable.id, existing[0].id));
  } else {
    await db.insert(paprikaCredentialsTable).values({
      email,
      encryptedPassword,
    });
  }

  res.json(
    SetPaprikaCredentialsResponse.parse({ configured: true, email })
  );
});

export default router;
