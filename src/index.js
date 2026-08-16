'use strict';

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   */
  register(/*{ strapi }*/) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * Opens public API access for the trade collection + the upload plugin
   * so the local Next.js frontend can read/write without an auth token.
   */
  async bootstrap({ strapi }) {
    const publicRole = await strapi.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'public' } });

    if (!publicRole) return;

    const actions = [
      'api::trade.trade.find',
      'api::trade.trade.findOne',
      'api::trade.trade.create',
      'api::trade.trade.update',
      'api::trade.trade.delete',
      'api::journal.journal.find',
      'api::journal.journal.findOne',
      'api::journal.journal.create',
      'api::journal.journal.update',
      'api::journal.journal.delete',
      'api::note-section.note-section.find',
      'api::note-section.note-section.findOne',
      'api::note-section.note-section.create',
      'api::note-section.note-section.update',
      'api::note-section.note-section.delete',
      'api::note-item.note-item.find',
      'api::note-item.note-item.findOne',
      'api::note-item.note-item.create',
      'api::note-item.note-item.update',
      'api::note-item.note-item.delete',
      'plugin::upload.content-api.upload',
      'plugin::upload.content-api.find',
      'plugin::upload.content-api.findOne',
      'plugin::upload.content-api.destroy',
    ];

    for (const action of actions) {
      const existing = await strapi.db
        .query('plugin::users-permissions.permission')
        .findOne({ where: { action, role: publicRole.id } });
      if (existing) {
        await strapi.db
          .query('plugin::users-permissions.permission')
          .update({ where: { id: existing.id }, data: { enabled: true } });
      } else {
        await strapi.db
          .query('plugin::users-permissions.permission')
          .create({ data: { action, enabled: true, role: publicRole.id } });
      }
    }

    strapi.log.info('[Permissions] Public API access enabled for trading journal frontend.');
  },
};
