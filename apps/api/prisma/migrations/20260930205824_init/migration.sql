-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'STAFF', 'MEMBER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "member_code" VARCHAR(20) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "email" VARCHAR(320),
    "date_of_birth" DATE,
    "gender" "Gender",
    "address" VARCHAR(500),
    "emergency_contact" VARCHAR(500),
    "status" "MemberStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "members_member_code_key" ON "members"("member_code");

-- CreateIndex
CREATE INDEX "members_status_idx" ON "members"("status");

-- CreateIndex
CREATE INDEX "members_last_name_first_name_idx" ON "members"("last_name", "first_name");

-- ---------------------------------------------------------------------------
-- Constraints that the Prisma schema language cannot express.
-- Prisma does not introspect expression indexes or CHECK constraints, so these
-- are invisible to `prisma migrate dev` and will not be reported as drift.
-- ---------------------------------------------------------------------------

-- Case-insensitive uniqueness. The plain unique index above is exact-match;
-- these indexes make "Bob@Gym.com" and "bob@gym.com" the same identity/member.
-- Create Unique Index
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email"));

-- Create Unique Index
CREATE UNIQUE INDEX "members_member_code_upper_key" ON "members" (upper("member_code"));

-- Phone duplicate prevention. Uniqueness is enforced on the digits-only form so
-- that formatting variants of one number ("+254 712 345 678" / "(0712) 345 678")
-- cannot register as two separate members. Formatting characters are stripped;
-- country-code prefixes are NOT, so "0712345678" and "+254712345678" are treated
-- as distinct numbers.
-- Create Unique Index
CREATE UNIQUE INDEX "members_phone_digits_key"
    ON "members" (regexp_replace("phone", '[^0-9]', '', 'g'));

-- Optional member email: not unique (household members may share an address),
-- but indexed so duplicate review and lookup stay fast. Partial to keep
-- non-members out of the index.
-- Create Index
CREATE INDEX "members_email_lower_idx"
    ON "members" (lower("email"))
    WHERE "email" IS NOT NULL;

-- Users: a blank email is never a usable login.
ALTER TABLE "users"
    ADD CONSTRAINT "users_email_not_blank" CHECK (btrim("email") <> '');

-- Surrounding whitespace would defeat the lower() uniqueness index above,
-- so reject it at write time instead of silently normalising.
ALTER TABLE "users"
    ADD CONSTRAINT "users_email_no_surrounding_whitespace" CHECK ("email" = btrim("email"));

-- Deliberately loose shape check (local@domain.tld). It rejects obvious garbage,
-- it is NOT RFC 5322 validation.
ALTER TABLE "users"
    ADD CONSTRAINT "users_email_shape" CHECK ("email" ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

-- A password hash must be present. This rejects empty/blank values; it cannot
-- verify that the value is actually a hash. Hashing is applied by the auth layer.
ALTER TABLE "users"
    ADD CONSTRAINT "users_password_hash_not_blank" CHECK (btrim("password_hash") <> '');

-- Members: member code must be present and free of surrounding whitespace.
ALTER TABLE "members"
    ADD CONSTRAINT "members_member_code_not_blank" CHECK (btrim("member_code") <> '');

ALTER TABLE "members"
    ADD CONSTRAINT "members_member_code_no_surrounding_whitespace" CHECK ("member_code" = btrim("member_code"));

-- Phone must contain 7-15 digits (E.164 maximum is 15). This also guarantees the
-- digits-only form is never empty, which would otherwise let two blank phone
-- values collide on members_phone_digits_key.
ALTER TABLE "members"
    ADD CONSTRAINT "members_phone_digit_count"
    CHECK (regexp_replace("phone", '[^0-9]', '', 'g') ~ '^[0-9]{7,15}$');

-- Optional text: NULL means "not provided". A blank string is rejected so the
-- two states stay distinguishable.
ALTER TABLE "members"
    ADD CONSTRAINT "members_email_not_blank" CHECK ("email" IS NULL OR btrim("email") <> '');

ALTER TABLE "members"
    ADD CONSTRAINT "members_address_not_blank" CHECK ("address" IS NULL OR btrim("address") <> '');

ALTER TABLE "members"
    ADD CONSTRAINT "members_emergency_contact_not_blank" CHECK ("emergency_contact" IS NULL OR btrim("emergency_contact") <> '');

-- Date of birth must be a real past date within a plausible human range.
ALTER TABLE "members"
    ADD CONSTRAINT "members_date_of_birth_range"
    CHECK (
        "date_of_birth" IS NULL
        OR ("date_of_birth" >= DATE '1900-01-01' AND "date_of_birth" <= CURRENT_DATE)
    );
