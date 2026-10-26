import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Hình dạng khớp `CmsTopic`, `CmsLevel`, `CmsVocabulary` trong worddefender/src/config/remoteContent.ts. */
export interface ContentPayload {
  rules: unknown;
  topics: {
    slug: string;
    title: string;
    description: string | null;
    themeColor: string | null;
    order: number | null;
    levels: {
      levelNumber: number;
      title: string | null;
      subtitle: string | null;
      difficulty: string;
      targetCount: number;
      minMissing: number | null;
      maxMissing: number | null;
      fallSpeed: number | null;
      spawnInterval: number | null;
      maxConcurrent: number | null;
    }[];
  }[];
  vocabulary: {
    headword: string;
    displayForm: string | null;
    topicSlug: string | null;
    levelNumber: number | null;
    orderIndex: number | null;
    category: string | null;
    meaningVi: string;
    phonetic: string | null;
    partOfSpeech: string | null;
    example: string | null;
    audio: { url: string } | null;
  }[];
}

const OFFICIAL_OWNER = 'official';

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  /** Gói nội dung chính thức cho game (BR1: không bao giờ có bộ từ riêng của người chơi). */
  async build(): Promise<ContentPayload> {
    const [config, topics, words] = await Promise.all([
      this.prisma.gameConfig.findFirst(),
      this.prisma.topic.findMany({
        where: { ownerKey: OFFICIAL_OWNER },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        include: { levels: { orderBy: { levelNumber: 'asc' } } },
      }),
      this.prisma.vocabulary.findMany({
        where: { ownerKey: OFFICIAL_OWNER },
        orderBy: [{ levelNumber: 'asc' }, { orderIndex: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return {
      rules: config?.rules ?? null,
      topics: topics.map((t) => ({
        slug: t.slug,
        title: t.title,
        description: t.description,
        themeColor: t.themeColor,
        order: t.order,
        levels: t.levels.map((l) => ({
          levelNumber: l.levelNumber,
          title: l.title,
          subtitle: l.subtitle,
          difficulty: l.difficulty,
          targetCount: l.targetCount,
          minMissing: l.minMissing,
          maxMissing: l.maxMissing,
          fallSpeed: l.fallSpeed === null ? null : l.fallSpeed.toNumber(),
          spawnInterval: l.spawnInterval,
          maxConcurrent: l.maxConcurrent,
        })),
      })),
      vocabulary: words.map((w) => ({
        headword: w.headword,
        displayForm: w.displayForm,
        topicSlug: w.topicSlug,
        levelNumber: w.levelNumber,
        orderIndex: w.orderIndex,
        category: w.category,
        meaningVi: w.meaningVi,
        phonetic: w.phonetic,
        partOfSpeech: w.partOfSpeech,
        example: w.example,
        audio: w.audioPath ? { url: `/uploads/${w.audioPath}` } : null,
      })),
    };
  }
}
