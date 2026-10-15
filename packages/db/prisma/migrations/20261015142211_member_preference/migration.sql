-- CreateTable
CREATE TABLE "MemberPreference" (
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "gettingStartedDismissedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberPreference_pkey" PRIMARY KEY ("userId","organizationId")
);

-- AddForeignKey
ALTER TABLE "MemberPreference" ADD CONSTRAINT "MemberPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberPreference" ADD CONSTRAINT "MemberPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
