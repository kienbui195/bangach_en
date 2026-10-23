import type { Core } from '@strapi/strapi';

const allowedMediaTypes = [
  'image/*',
  'video/*',
  'audio/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.*',
  'text/plain',
  'text/csv',
];

const deniedTypes = [
  'image/svg+xml',
  'application/vnd.microsoft.portable-executable',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-dosexec',
  'application/x-sh',
  'text/x-shellscript',
  'application/x-mach-binary',
];

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  'users-permissions': {
    config: {
      jwtManagement: 'refresh',
      sessions: {
        httpOnly: true,
      },
    },
  },
  'wd-import-export': {
    enabled: true,
    resolve: './src/plugins/wd-import-export',
    config: {
      // null = mọi content type api::; đặt mảng uid để giới hạn
      allowedUids: ['api::topic.topic', 'api::level.level', 'api::vocabulary.vocabulary', 'api::game-config.game-config'],
    },
  },
  upload: {
    config: {
      // Trần chung cho Media Library của admin; file khách gửi bị siết chặt hơn (chỉ âm thanh,
      // tối đa 2MB) trong src/middlewares/public-upload-guard.ts
      sizeLimit: 10 * 1024 * 1024,
      security: {
        allowedTypes: allowedMediaTypes,
        deniedTypes,
      },
    },
  },
});

export default config;
