'use strict';

/**
 * trade service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::trade.trade');
