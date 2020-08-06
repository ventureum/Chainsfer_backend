// @flow
import numeral from 'numeral'

module.exports = {
  lowerCaseFirstLetter: function (str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1)
  },

  sleep: function (delay: number) {
    var start = new Date().getTime()
    while (new Date().getTime() < start + delay);
  },

  formatNumber: function (number: number | string): string {
    return numeral(number).format('0.00')
  }
}
