/**
 * @file lib/endpoint.js
 */

var Q       = require('q');
var errors  = require('common-errors');
var extend  = require('extend');
var request = require('request-promise');
var utils   = require('./util.js');
var SeedsClassGenerator = require('./seeds.js');

ERROR_MESSAGES = {
  MISSING_BASE_URL: '"baseUrl" must be defined for the Seeds API to be used.',
  NOT_CONNECTED: 'Seeds API must be initialized before usage.',
  ENDPOINT_NOT_FOUND: 'Seeds API path "%path" could not be found'
};

module.exports = SeedsEndpoint;


/**
 * Seeds endpoint class.
 * @param {object} Endpoint settings.
 */
function SeedsEndpoint(config) {
  this.baseUrl = '';
  this.connected = false;
  this.connecting = null;

  // Perform initial setup only if configuration were given.
  // Usualy this happens on a new seeds endpoint instance creation.
  if (config) this.init(config);

  // Generate instance's Seeds class.
  this.Seeds = SeedsClassGenerator(this);
  this.seeds = {};
}


/*
 * ==========================
 * Class properties
 * ==========================
 */

// Allow for the creation of new endpoint instances.
SeedsEndpoint.newEndpoint = SeedsEndpoint;


/*
 * ==========================
 * Instance methods
 * ==========================
 */

/**
 * Setup seeds endpoint instance.
 * @param {object}   Endpoint settings.
 * @return {promise} The connectivity state (either true or false).
 */
SeedsEndpoint.prototype.init = function (config) {
  extend(true, this, config);
  if (!this.baseUrl) throw new errors.ArgumentNullError('config.baseUrl');
  return this.hasConnectivity();
};

/**
 * Setup helper for protractor environments.
 */
SeedsEndpoint.prototype.initProtractor = function (config) {
  return this.init(extend(true, {
    baseUrl: browser.baseUrl + '/seeds',
  }, config)).catch(function (response) {
    if (response && response.req && response.req.path) {
      // @todo: try and connect mannually?
      throw 'Could not connect to Seeds API at path "' + response.req.path + '"'
    }
  });
};

/**
 * Validates connectivity.
 */
SeedsEndpoint.prototype.hasConnectivity = function () {
  if (!this.baseUrl) throw new errors.InvalidOperationError(ERROR_MESSAGES.MISSING_BASE_URL);

  this.connecting = Q.when(this.connectivity || this.connecting || request({
    url: 'touch',
    baseUrl: this.baseUrl,
    // simple: false,
    transform: function (body, response) {
      if (response.statusCode === 200 && body.match(/seeds@[0-9].[0-9x].[0-9x]/)) {
        return true;
      } else {
        throw response;
      }
    }
  }));

  this.connecting.catch(this.setConnectivity.bind(this, false));
  this.connecting.catch(handleRequestError);
  this.connecting.then(this.setConnectivity.bind(this));

  return this.connecting;
};

/**
 * Sets connectivity value.
 */
SeedsEndpoint.prototype.setConnectivity = function (value) {
  this.connecting = null;
  return this.connected = value;
};

/**
 * Requests endpoint's seed API.
 */
SeedsEndpoint.prototype.request = function (url, payload) {
  if (!this.baseUrl) throw new errors.InvalidOperationError(ERROR_MESSAGES.MISSING_BASE_URL);
  if (!this.connected) throw new errors.InvalidOperationError(ERROR_MESSAGES.NOT_CONNECTED);

  return request({
    url: url,
    baseUrl: this.baseUrl,
    form: payload,
    json: true,
    method: 'POST'
  }).catch(handleRequestError);
};

/**
 * Register a new seeds group from this endpoint connection.
 */
SeedsEndpoint.prototype.registerSeeds = function (name, seeds) {
  this.seeds[name] = seeds;
};

/**
 * Grab a previously registered seeds group.
 */
SeedsEndpoint.prototype.getSeeds = function (name) {
  return this.seeds[name] || null;
};


/*
 * ==========================
 * Helper methods
 * ==========================

/**
 * Handle request error responses.
 */
function handleRequestError(response) {
  if (response.statusCode == 404) {
    var message = ERROR_MESSAGES.ENDPOINT_NOT_FOUND.replace('%path', response.response.req.path);
    throw new errors.HttpStatusError(404, message);
  }
}
