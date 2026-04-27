-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "progress" (
    "id" SERIAL NOT NULL,
    "process" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "type" TEXT,
    "status" TEXT,
    "completion" DECIMAL(5,4) DEFAULT 0,
    "doc" DECIMAL(5,4) DEFAULT 0,
    "people" TEXT[],
    "dept" TEXT,
    "priority" TEXT,
    "start_date" TEXT,
    "deadline" TEXT,
    "frequency" TEXT,
    "auto_fte" DECIMAL(10,4),
    "manual_fte" DECIMAL(10,4),
    "last_run_date" TEXT,
    "last_run_count" INTEGER,
    "purpose" TEXT,
    "expected_results" TEXT,
    "beta_testing_date" TEXT,

    CONSTRAINT "progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_updates" (
    "id" SERIAL NOT NULL,
    "progress_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" SERIAL NOT NULL,
    "progress_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "due_date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_requests" (
    "id" SERIAL NOT NULL,
    "progress_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT DEFAULT '',
    "priority" TEXT DEFAULT 'Medium',
    "status" TEXT DEFAULT 'Pending',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Member',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_addons" (
    "id" SERIAL NOT NULL,
    "progress_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT DEFAULT '',
    "priority" TEXT DEFAULT 'Medium',
    "status" TEXT DEFAULT 'Requested',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirements" (
    "id" SERIAL NOT NULL,
    "progress_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT DEFAULT '',
    "priority" TEXT DEFAULT 'Medium',
    "status" TEXT DEFAULT 'Open',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_dates" (
    "id" SERIAL NOT NULL,
    "progress_id" INTEGER NOT NULL,
    "run_date" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_dates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "progress_process_key" ON "progress"("process");

-- CreateIndex
CREATE INDEX "idx_meeting_updates_progress_id" ON "meeting_updates"("progress_id");

-- CreateIndex
CREATE INDEX "idx_milestones_progress_id" ON "milestones"("progress_id");

-- CreateIndex
CREATE INDEX "idx_change_requests_progress_id" ON "change_requests"("progress_id");

-- CreateIndex
CREATE UNIQUE INDEX "credentials_username_key" ON "credentials"("username");

-- CreateIndex
CREATE INDEX "idx_feature_addons_progress_id" ON "feature_addons"("progress_id");

-- CreateIndex
CREATE INDEX "idx_requirements_progress_id" ON "requirements"("progress_id");

-- CreateIndex
CREATE INDEX "idx_run_dates_progress_id" ON "run_dates"("progress_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_run_dates_unique" ON "run_dates"("progress_id", "run_date");

-- AddForeignKey
ALTER TABLE "meeting_updates" ADD CONSTRAINT "meeting_updates_progress_id_fkey" FOREIGN KEY ("progress_id") REFERENCES "progress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_progress_id_fkey" FOREIGN KEY ("progress_id") REFERENCES "progress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_progress_id_fkey" FOREIGN KEY ("progress_id") REFERENCES "progress"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "feature_addons" ADD CONSTRAINT "feature_addons_progress_id_fkey" FOREIGN KEY ("progress_id") REFERENCES "progress"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_progress_id_fkey" FOREIGN KEY ("progress_id") REFERENCES "progress"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "run_dates" ADD CONSTRAINT "run_dates_progress_id_fkey" FOREIGN KEY ("progress_id") REFERENCES "progress"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

