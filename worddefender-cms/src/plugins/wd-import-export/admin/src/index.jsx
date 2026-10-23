import { Upload } from '@strapi/icons';

const PLUGIN_ID = 'wd-import-export';

export default {
  register(app) {
    app.addMenuLink({
      to: `/plugins/${PLUGIN_ID}`,
      icon: Upload,
      intlLabel: { id: `${PLUGIN_ID}.menu`, defaultMessage: 'Import / Export' },
      Component: async () => {
        const { HomePage } = await import('./pages/HomePage.jsx');
        return HomePage;
      },
    });

    app.registerPlugin({ id: PLUGIN_ID, name: PLUGIN_ID });
  },
};
