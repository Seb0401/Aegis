CREATE TABLE "processed_incomes" (
	"user_id" text NOT NULL,
	"tx_hash" text NOT NULL,
	"proposal_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_incomes_user_id_tx_hash_pk" PRIMARY KEY("user_id","tx_hash")
);
--> statement-breakpoint
CREATE TABLE "split_rules" (
	"user_id" text PRIMARY KEY NOT NULL,
	"config" jsonb NOT NULL,
	"watching_since" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "processed_incomes" ADD CONSTRAINT "processed_incomes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_rules" ADD CONSTRAINT "split_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "processed_incomes_user_idx" ON "processed_incomes" USING btree ("user_id","created_at");