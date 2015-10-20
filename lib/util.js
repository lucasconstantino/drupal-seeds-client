/**
 * @file lib/utils.js
 */

module.exports = {

  /**
   * Helper method to self push value.
   */
  push: function push(value) {
    this.push(value);
  },

  /**
   * Nil implementation.
   */
  nil: function nil() {},

  /**
   * Throw errors up.
   */
  throwUp: function (err) {
    throw err;
  }
};
