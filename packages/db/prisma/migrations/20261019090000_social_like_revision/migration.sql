CREATE TABLE "SocialLikeRevision" (
    "userId" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SocialLikeRevision_pkey" PRIMARY KEY ("userId", "targetKey"),
    CONSTRAINT "SocialLikeRevision_revision_check" CHECK ("revision" >= 0)
);
