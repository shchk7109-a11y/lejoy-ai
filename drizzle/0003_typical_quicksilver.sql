CREATE TABLE `credit_code_batch_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`adminId` int NOT NULL,
	`action` enum('created','activated','revoked') NOT NULL,
	`quantity` int NOT NULL,
	`reason` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `credit_code_batch_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `credit_code_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`amount` int NOT NULL,
	`quantity` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`purpose` enum('purchase','promotion') NOT NULL,
	`receiptRef` varchar(160),
	`status` enum('pending','active','revoked') NOT NULL DEFAULT 'pending',
	`createdBy` int NOT NULL,
	`activatedBy` int,
	`revokedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`activatedAt` timestamp,
	`revokedAt` timestamp,
	CONSTRAINT `credit_code_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `credit_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`codeHash` varchar(64) NOT NULL,
	`status` enum('unused','redeemed','revoked') NOT NULL DEFAULT 'unused',
	`redeemedBy` int,
	`redeemedAt` timestamp,
	CONSTRAINT `credit_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `credit_codes_codeHash_unique` UNIQUE(`codeHash`)
);
--> statement-breakpoint
CREATE TABLE `hq_admin_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(80) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`totpSecretEncrypted` text NOT NULL,
	`mustChangePassword` int NOT NULL DEFAULT 1,
	`disabled` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hq_admin_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `hq_admin_accounts_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `hq_admin_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastUsedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`revokedAt` timestamp,
	CONSTRAINT `hq_admin_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `hq_admin_sessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(160) NOT NULL,
	`enabled` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stores_id` PRIMARY KEY(`id`),
	CONSTRAINT `stores_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `credit_transactions` MODIFY COLUMN `type` enum('consume','recharge','register','redeem') NOT NULL;--> statement-breakpoint
ALTER TABLE `credit_transactions` ADD `creditCodeId` int;--> statement-breakpoint
ALTER TABLE `credit_transactions` ADD CONSTRAINT `credit_transactions_creditCodeId_unique` UNIQUE(`creditCodeId`);