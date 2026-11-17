// A Map-backed adapter that records the options its constructor received.
class SpyAdapter extends Map {
  constructor(options) {
    super();
    SpyAdapter.options = options;
  }
}
module.exports = SpyAdapter;
