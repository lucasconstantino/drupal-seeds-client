/**
 * @file lib/seeds.js
 */

var Q             = require('q');
var async         = require('async');
var errors        = require('common-errors');
var shortid       = require('shortid');
var traverse      = require('traverse');
var inherits      = require('util').inherits;
var EventEmitter  = require("events");
var util          = require('./util');

module.exports = SeedsClassGenerator;

/**
 * Seeds class generator.
 * @param {SeedsEndpoint} The API endpoint instance.
 */
function SeedsClassGenerator(seedsEndpoint) {

  /**
   * Seeds main class.
   */
  function Seeds(seeds, name) {

    // Extend event emitter.
    EventEmitter.call(this);

    this.seeds = seeds;
    this.values = seeds.map(util.nil);

    // Register new seeds to endpoint.
    seedsEndpoint.registerSeeds(name || shortid.generate(), this);
  }

  inherits(Seeds, EventEmitter);


  /*
   * ==========================
   * Class methods
   * ==========================
   */

  /**
   * Parser generator.
   * @param {Number} The index of the seed to use data from. Must be an index
   *                 lower then the current parsing seed.
   * @param {Array} Path to the property inside the above targeted seed.
   */
  Seeds.parser = function (index, path) {
    return function () {
      return Seeds.prototype.parse.apply(this, [index, path]);
    };
  };


  /*
   * ==========================
   * Instance methods
   * ==========================
   */

  /**
   * Request wrapper method.
   */
  Seeds.prototype.request = function (index, action) {
    if (!this.seeds[index]) throw new errors.NotFoundError('seed of index "' + index + '"');

    var payload = {
      data: this.seeds[index].data || null,
      value: this.values[index] || {},
      config: this.seeds[index].config || {}
    };

    return seedsEndpoint.request(this.seeds[index].type + '/' + action, payload);
  };

  /**
   * Create a given seed.
   */
  Seeds.prototype.create = function (index) {
    if (!this.seeds[index]) throw new errors.NotFoundError('seed of index "' + index + '"');

    var seedsInstance = this;

    // Execute any seed property getter.
    this.seeds[index] = traverse(this.seeds[index]).map(function (value) {
      if (typeof value == 'function') {
        this.update(value.apply(seedsInstance, [index, seedsInstance.values, seedsInstance.seeds]), true);
      }
    });

    return this.request(index, 'create').then(function (value) {
      return seedsInstance.values[index] = value;
    });
  };

  /**
   * Create all seeds.
   */
  Seeds.prototype.createAll = function () {
    var seedsInstance = this;

    return Q.Promise(function (resolve, reject, notify) {
      async.mapSeries(seedsInstance.seeds, function (seed, next) {
        var creating = seedsInstance.create(seedsInstance.seeds.indexOf(seed));
        creating.then(notify);
        creating.then(next.bind(null, null));
        creating.catch(next.bind(null));
      }, function (err, values) {
        err ? reject(err) : resolve(values);
      });
    });
  };

  /**
   * Remove a given seed.
   */
  Seeds.prototype.remove = function (index) {
    if (!this.seeds[index]) throw new errors.NotFoundError('seed of index "' + index + '"');
    return this.request(index, 'remove');
  };

  /**
   * Remove all seeds.
   */
  Seeds.prototype.removeAll = function () {
    var seedsInstance = this;

    return Q.Promise(function (resolve, reject, notify) {
      async.mapSeries(seedsInstance.seeds, function (seed, next) {
        var removing = seedsInstance.remove(seedsInstance.seeds.indexOf(seed));
        removing.then(notify);
        removing.then(next.bind(null, null));
        removing.catch(next.bind(null));
      }, function (err, results) {
        err ? reject(err) : resolve(results);
      });
    });
  };

  /**
   * Bind seeds addition and removal to flow control.
   */
  Seeds.prototype.attach = function () {
    GLOBAL.beforeAll && beforeAll(this.createAll.bind(this));
    // @todo: does this work?
    GLOBAL.afterAll && afterAll(this.removeAll.bind(this));
    return this; // Chain.
  };

  /**
   * Flow helper method to perform actions with the created seeds, and
   * remove them automatically afterwards.
   */
  Seeds.prototype.with = function (body) {
    return this.createAll().then(function () {
      var result = body.apply(this, [this.values, this.seeds, this.removeAll]);
      if (result && result.then) return result.done(this.removeAll);
      if (body.length < 3) return this.removeAll();
    }.bind(this));
  };

  /**
   * Parse a deep value from a given seed's value.
   */
  Seeds.prototype.parse = function (index, path) {
    var value = this.values[index];
    var parts = Array.isArray(path) ? path : (path || '').split('.');
    var walked = [];
    var path;

    while(parts && parts.length) {
      walked.push(path = parts.shift());
      if (!value || !value.hasOwnProperty(path)) {
        throw new errors.NotFoundError('property value "' + walked.join('.') + '"');
      }
      value = value[path];
    }

    return value;
  };

  return Seeds;
}
