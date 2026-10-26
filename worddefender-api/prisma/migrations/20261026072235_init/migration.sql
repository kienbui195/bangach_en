-- CreateTable
CREATE TABLE `topics` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(100) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `source` ENUM('official', 'custom') NOT NULL,
    `visibility` ENUM('private', 'pending', 'approved', 'rejected') NOT NULL,
    `owner_key` VARCHAR(64) NOT NULL,
    `domain` VARCHAR(100) NULL,
    `order` INTEGER NULL,
    `cefr` ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2') NULL,
    `description` TEXT NULL,
    `theme_color` VARCHAR(16) NULL,
    `reviewed_by` VARCHAR(100) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `topics_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `levels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `topic_id` INTEGER NOT NULL,
    `unique_key` VARCHAR(120) NOT NULL,
    `level_number` INTEGER NOT NULL,
    `title` VARCHAR(200) NULL,
    `subtitle` VARCHAR(200) NULL,
    `difficulty` ENUM('easy', 'medium', 'hard', 'boss') NOT NULL,
    `is_boss` BOOLEAN NOT NULL DEFAULT false,
    `target_count` INTEGER NOT NULL,
    `min_missing` INTEGER NULL,
    `max_missing` INTEGER NULL,
    `fall_speed` DECIMAL(6, 2) NULL,
    `spawn_interval` INTEGER NULL,
    `max_concurrent` INTEGER NULL,
    `is_generated` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `levels_unique_key_key`(`unique_key`),
    INDEX `levels_topic_id_level_number_idx`(`topic_id`, `level_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vocabularies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_key` VARCHAR(64) NOT NULL,
    `headword` VARCHAR(16) NOT NULL,
    `display_form` VARCHAR(100) NULL,
    `kind` ENUM('word', 'term', 'abbreviation') NOT NULL,
    `topic_slug` VARCHAR(100) NULL,
    `level_number` INTEGER NULL,
    `order_index` INTEGER NULL,
    `category` VARCHAR(100) NULL,
    `meaning_vi` VARCHAR(500) NOT NULL,
    `phonetic` VARCHAR(100) NULL,
    `part_of_speech` ENUM('noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'auxiliary', 'particle', 'determiner', 'interjection', 'phrase') NULL,
    `example` TEXT NULL,
    `cefr` ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2') NULL,
    `length` INTEGER NULL,
    `audio_path` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `vocabularies_topic_slug_level_number_idx`(`topic_slug`, `level_number`),
    UNIQUE INDEX `vocabularies_owner_key_headword_key`(`owner_key`, `headword`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `game_config` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rules` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `word_reports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `headword` VARCHAR(16) NOT NULL,
    `field` ENUM('headword', 'displayForm', 'meaningVi', 'phonetic', 'example', 'audio') NOT NULL,
    `current_value` TEXT NULL,
    `suggested_value` TEXT NULL,
    `suggested_audio_path` VARCHAR(255) NULL,
    `note` TEXT NULL,
    `reporter_key` VARCHAR(64) NULL,
    `review_status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `review_note` TEXT NULL,
    `applied_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `word_reports_review_status_idx`(`review_status`),
    INDEX `word_reports_headword_idx`(`headword`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `levels` ADD CONSTRAINT `levels_topic_id_fkey` FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
