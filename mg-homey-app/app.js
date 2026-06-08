'use strict';

const Homey = require('homey');

class MgElectricApp extends Homey.App {
  async onInit() {
    this.log('MG Electric app started');
  }
}

module.exports = MgElectricApp;
