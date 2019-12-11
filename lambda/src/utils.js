// @flow

module.exports = {
  lowerCaseFirstLetter: function (str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1)
  },

  sleep: function (delay: number) {
    var start = new Date().getTime()
    while (new Date().getTime() < start + delay);
  }
}
