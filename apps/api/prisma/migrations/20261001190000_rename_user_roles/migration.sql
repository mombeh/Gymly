-- Rename the Gymly access levels to the four fixed roles.
-- RENAME VALUE is used rather than dropping and recreating the type so that
-- any existing users keep their rows and their role.
ALTER TYPE "UserRole" RENAME VALUE 'ADMIN' TO 'RECEPTIONIST';
ALTER TYPE "UserRole" RENAME VALUE 'STAFF' TO 'TRAINER';
