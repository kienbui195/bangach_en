import type { StrapiApp } from '@strapi/strapi/admin';
import AuthLogo from './extensions/auth-logo.png';
import MenuLogo from './extensions/menu-logo.png';
import favicon from '../../favicon.png';

const APP_TITLE = 'Bangach Dashboard';

export default {
  config: {
    auth: { logo: AuthLogo },
    menu: { logo: MenuLogo },
    head: { favicon, title: APP_TITLE },
    translations: {
      en: {
        'app.components.LeftMenu.navbrand.title': APP_TITLE,
        'app.components.LeftMenu.navbrand.workplace': 'Chungcake69',
        'Auth.form.welcome.title': `Chào mừng đến ${APP_TITLE}`,
        'Auth.form.welcome.subtitle': 'Đăng nhập vào tài khoản quản trị',
      },
    },
    tutorials: false,
    notifications: { releases: false },
  },
  bootstrap(_app: StrapiApp) {
    // Tiêu đề tab do từng trang đặt dạng "<trang> | Strapi": đổi tên thương hiệu trong tiêu đề
    const fixTitle = () => {
      if (document.title.includes('Strapi')) document.title = document.title.replace(/Strapi( Dashboard)?/g, APP_TITLE);
    };
    fixTitle();
    const titleEl = document.querySelector('title');
    if (titleEl) new MutationObserver(fixTitle).observe(titleEl, { childList: true, characterData: true, subtree: true });
  },
};
