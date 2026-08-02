CREATE TABLE `media_check_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trace_id` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`status` enum('pending','pass','risky') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `media_check_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `media_check_tasks_trace_id_unique` UNIQUE(`trace_id`)
);
