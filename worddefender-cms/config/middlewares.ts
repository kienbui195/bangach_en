import type { Core } from '@strapi/strapi';

const config: Core.Config.Middlewares = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'global::public-upload-guard', // sau body để đọc được file đã parse
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;
