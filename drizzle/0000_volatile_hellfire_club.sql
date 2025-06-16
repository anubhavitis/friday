CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number")
);
