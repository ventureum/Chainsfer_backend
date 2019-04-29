// @flow

module.exports = {
  maskEmail: function (email: string) {
    // first split str by '@'
    let parts = email.split('@')

    // [first]***[last]@[parts[1]]
    return parts[0].slice(0, 1) + '*****' + parts[0].slice(-1) + '@' + parts[1]
  },

  lowerCaseFirstLetter: function (str: string) {
    return str.charAt(0).toLowerCase() + str.slice(1)
  }
}
