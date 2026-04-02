CREATE TABLE `chat_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chat_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`imageUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`configKey` varchar(64) NOT NULL,
	`label` varchar(128) NOT NULL,
	`provider` varchar(64) NOT NULL,
	`modelName` varchar(128) NOT NULL,
	`apiKey` text,
	`baseUrl` varchar(512),
	`extraParams` json,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `model_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `model_configs_configKey_unique` UNIQUE(`configKey`)
);
--> statement-breakpoint
CREATE TABLE `points_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`amount` int NOT NULL,
	`type` enum('consume','recharge','gift','register') NOT NULL,
	`description` varchar(256),
	`operatorId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `points_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(256) NOT NULL,
	`characterName` varchar(64) NOT NULL,
	`theme` varchar(64) NOT NULL,
	`pageCount` int NOT NULL DEFAULT 4,
	`pages` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(64) NOT NULL,
	`settingValue` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_settings_settingKey_unique` UNIQUE(`settingKey`)
);
--> statement-breakpoint
CREATE TABLE `user_api_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`configKey` varchar(64) NOT NULL,
	`modelName` varchar(128),
	`apiKey` text,
	`baseUrl` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_api_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `points` int DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `isFrozen` boolean DEFAULT false NOT NULL;