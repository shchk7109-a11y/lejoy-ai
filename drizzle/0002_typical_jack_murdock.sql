CREATE TABLE `api_call_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`module` varchar(64) NOT NULL,
	`modelUsed` varchar(128),
	`success` boolean NOT NULL DEFAULT true,
	`errorMessage` text,
	`durationMs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `api_call_logs_id` PRIMARY KEY(`id`)
);
