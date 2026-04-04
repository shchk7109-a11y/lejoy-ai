CREATE TABLE `ai_models` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`displayName` varchar(200) NOT NULL,
	`apiKey` text NOT NULL,
	`baseUrl` varchar(500) NOT NULL,
	`modelName` varchar(200) NOT NULL,
	`enabled` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_models_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_models_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `credit_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`amount` int NOT NULL,
	`type` enum('consume','recharge','register') NOT NULL,
	`feature` varchar(100),
	`description` text,
	`balanceAfter` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `credit_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_info` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`wechatId` varchar(100),
	`phone` varchar(20),
	`notes` text,
	`tags` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_info_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_info_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `credits` int DEFAULT 100 NOT NULL;