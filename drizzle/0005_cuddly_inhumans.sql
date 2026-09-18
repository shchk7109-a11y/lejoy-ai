CREATE TABLE `store_sync_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`status` enum('success','failure') NOT NULL,
	`insertedCount` int NOT NULL DEFAULT 0,
	`updatedCount` int NOT NULL DEFAULT 0,
	`disabledCount` int NOT NULL DEFAULT 0,
	`errorCode` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `store_sync_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `credit_code_batches` MODIFY COLUMN `storeId` int;--> statement-breakpoint
ALTER TABLE `credit_code_batches` ADD `targetKind` enum('store','hq_staff','company_test','trial') DEFAULT 'store' NOT NULL;--> statement-breakpoint
ALTER TABLE `credit_code_batches` ADD `recipientLabel` varchar(160);--> statement-breakpoint
ALTER TABLE `stores` ADD `sourceFormatId` varchar(100);--> statement-breakpoint
ALTER TABLE `stores` ADD `sourceStoreId` varchar(100);--> statement-breakpoint
ALTER TABLE `stores` ADD `sourceFormatName` varchar(160);--> statement-breakpoint
ALTER TABLE `stores` ADD `lastSyncedAt` timestamp;--> statement-breakpoint
ALTER TABLE `stores` ADD CONSTRAINT `stores_source_pair_unique` UNIQUE(`sourceFormatId`,`sourceStoreId`);